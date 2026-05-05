"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";

import { apiDelete, apiGet, apiPost, apiPostStream, apiUpload } from "@/lib/api";
import { isProcessingStatus, statusTone } from "@/lib/document-status";

type User = {
  id: string;
  email: string;
  is_active: boolean;
};

type DocumentItem = {
  id: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  processing_status: string;
  processing_stage: string;
  processing_progress: number;
  extracted_text?: string | null;
  error_message?: string | null;
  created_at: string;
};

type DocumentPage = {
  id: string;
  page_number: number;
  text: string;
  extraction_method: string;
  created_at: string;
};

type DocumentChunk = {
  id: string;
  chunk_index: number;
  page_number: number;
  text: string;
  char_start: number;
  char_end: number;
  embedding_status: string;
  created_at: string;
};

type RetrievalResult = {
  citation_id: number;
  text: string;
  citation: {
    citation_id?: number;
    chunk_id?: string;
    document_id?: string;
    document_filename: string;
    page_number: number;
    chunk_index: number;
    score: number;
    distance: number;
    rerank_score?: number | null;
  };
};

type Citation = RetrievalResult["citation"];

type RetrievalResponse = {
  query: string;
  context: string;
  results: RetrievalResult[];
};

type ChatStreamEvent =
  | { type: "session"; session_id: string }
  | { type: "token"; text: string }
  | { type: "error"; message: string }
  | {
      type: "done";
      session_id: string;
      answer: string;
      citations: Citation[];
      context: string;
    };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  context: string | null;
  citations: Citation[] | null;
  created_at: string;
};

type ChatSession = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type ChatSessionDetail = ChatSession & {
  messages: ChatMessage[];
};

const tokenStorageKey = "drug-leaflet-agent-token";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function DashboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeDocument, setActiveDocument] = useState<DocumentItem | null>(null);
  const [activePages, setActivePages] = useState<DocumentPage[]>([]);
  const [activeChunks, setActiveChunks] = useState<DocumentChunk[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RetrievalResult[]>([]);
  const [chatMessage, setChatMessage] = useState("");
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [status, setStatus] = useState<string | null>("Loading workspace...");
  const [isUploading, setIsUploading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  async function loadDocuments(authToken: string) {
    const items = await apiGet<DocumentItem[]>("/api/v1/documents", authToken);
    setDocuments(items);
  }

  async function loadChatSessions(authToken: string) {
    const sessions = await apiGet<ChatSession[]>("/api/v1/chat/sessions", authToken);
    setChatSessions(sessions);
  }

  useEffect(() => {
    const savedToken = window.localStorage.getItem(tokenStorageKey);
    if (!savedToken) {
      setStatus(null);
      return;
    }

    setToken(savedToken);
    Promise.all([
      apiGet<User>("/api/v1/auth/me", savedToken),
      apiGet<DocumentItem[]>("/api/v1/documents", savedToken),
      apiGet<ChatSession[]>("/api/v1/chat/sessions", savedToken),
    ])
      .then(([currentUser, items, sessions]) => {
        setUser(currentUser);
        setDocuments(items);
        setChatSessions(sessions);
        setStatus(null);
      })
      .catch(() => {
        window.localStorage.removeItem(tokenStorageKey);
        setToken(null);
        setStatus("Please sign in again.");
      });
  }, []);

  useEffect(() => {
    if (!token || !documents.some((document) => isProcessingStatus(document.processing_status))) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        await loadDocuments(token);
        if (activeDocument && isProcessingStatus(activeDocument.processing_status)) {
          const [document, pages, chunks] = await Promise.all([
            apiGet<DocumentItem>(`/api/v1/documents/${activeDocument.id}`, token),
            apiGet<DocumentPage[]>(`/api/v1/documents/${activeDocument.id}/pages`, token),
            apiGet<DocumentChunk[]>(`/api/v1/documents/${activeDocument.id}/chunks`, token),
          ]);
          setActiveDocument(document);
          setActivePages(pages);
          setActiveChunks(chunks);
        }
      } catch {
        setStatus("Could not refresh processing status.");
      }
    }, 3000);

    return () => window.clearInterval(timer);
  }, [token, documents, activeDocument]);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages, isAsking]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedFile) return;

    setIsUploading(true);
    setStatus(null);
    try {
      await apiUpload<DocumentItem>("/api/v1/documents", selectedFile, token);
      setSelectedFile(null);
      event.currentTarget.reset();
      await loadDocuments(token);
      setStatus("File uploaded and processing queued.");
    } catch {
      setStatus("Upload failed. Use a PDF, JPEG, PNG, or WebP under the size limit.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(documentId: string) {
    if (!token) return;

    try {
      await apiDelete(`/api/v1/documents/${documentId}`, token);
      setDocuments((items) => items.filter((item) => item.id !== documentId));
      setActiveDocument((item) => (item?.id === documentId ? null : item));
      if (activeDocument?.id === documentId) {
        setActivePages([]);
        setActiveChunks([]);
        setSelectedCitation(null);
      }
      setStatus("Document deleted.");
    } catch {
      setStatus("Delete failed.");
    }
  }

  async function handleRefresh() {
    if (!token) return;

    await loadDocuments(token);
    if (activeDocument) {
      const [document, pages, chunks] = await Promise.all([
        apiGet<DocumentItem>(`/api/v1/documents/${activeDocument.id}`, token),
        apiGet<DocumentPage[]>(`/api/v1/documents/${activeDocument.id}/pages`, token),
        apiGet<DocumentChunk[]>(`/api/v1/documents/${activeDocument.id}/chunks`, token),
      ]);
      setActiveDocument(document);
      setActivePages(pages);
      setActiveChunks(chunks);
    }
    setStatus("Document status refreshed.");
  }

  function isSelectedPage(pageNumber: number) {
    return selectedCitation?.page_number === pageNumber;
  }

  function isSelectedChunk(chunk: DocumentChunk) {
    return (
      selectedCitation !== null &&
      (selectedCitation.chunk_id === chunk.id ||
        (selectedCitation.page_number === chunk.page_number &&
          selectedCitation.chunk_index === chunk.chunk_index))
    );
  }

  async function handleOpen(documentId: string, citation?: Citation) {
    if (!token) return;

    try {
      const [document, pages, chunks] = await Promise.all([
        apiGet<DocumentItem>(`/api/v1/documents/${documentId}`, token),
        apiGet<DocumentPage[]>(`/api/v1/documents/${documentId}/pages`, token),
        apiGet<DocumentChunk[]>(`/api/v1/documents/${documentId}/chunks`, token),
      ]);
      setActiveDocument(document);
      setActivePages(pages);
      setActiveChunks(chunks);
      setSelectedCitation(citation ?? null);
      setStatus(citation ? "Source loaded." : null);
    } catch {
      setStatus("Could not load document details.");
    }
  }

  async function handleOpenCitation(citation: Citation) {
    if (!citation.document_id) {
      setSelectedCitation(citation);
      setStatus("This citation does not include a document link.");
      return;
    }

    await handleOpen(citation.document_id, citation);
  }

  async function handleRetry(documentId: string) {
    if (!token) return;

    try {
      const document = await apiPost<DocumentItem>(
        `/api/v1/documents/${documentId}/process`,
        {},
        token,
      );
      setActiveDocument(document);
      setActivePages([]);
      setActiveChunks([]);
      await loadDocuments(token);
      setStatus("Processing queued.");
    } catch {
      setStatus("Could not queue processing.");
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !searchQuery.trim()) return;

    setIsSearching(true);
    setStatus(null);
    try {
      const response = await apiPost<RetrievalResponse>(
        "/api/v1/retrieval/query",
        { query: searchQuery, top_k: 5 },
        token,
      );
      setSearchResults(response.results);
      setStatus(response.results.length ? "Retrieval complete." : "No indexed chunks matched.");
    } catch {
      setStatus("Search failed. Make sure at least one document has indexed chunks.");
    } finally {
      setIsSearching(false);
    }
  }

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !chatMessage.trim()) return;

    const question = chatMessage.trim();
    const now = new Date().toISOString();
    const userMessageId = `${now}-user`;
    const assistantMessageId = `${now}-assistant`;

    setIsAsking(true);
    setStatus(null);
    setChatMessage("");
    setChatMessages((messages) => [
      ...messages,
      {
        id: userMessageId,
        role: "user",
        content: question,
        context: null,
        citations: null,
        created_at: now,
      },
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        context: null,
        citations: null,
        created_at: now,
      },
    ]);

    try {
      await apiPostStream<ChatStreamEvent>(
        "/api/v1/chat/stream",
        { message: question, top_k: 5, session_id: chatSessionId },
        token,
        (streamEvent) => {
          if (streamEvent.type === "session") {
            setChatSessionId(streamEvent.session_id);
            return;
          }

          if (streamEvent.type === "token") {
            setChatMessages((messages) =>
              messages.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: `${message.content}${streamEvent.text}` }
                  : message,
              ),
            );
            return;
          }

          if (streamEvent.type === "error") {
            throw new Error(streamEvent.message);
          }

          setChatSessionId(streamEvent.session_id);
          setChatMessages((messages) =>
            messages.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: streamEvent.answer,
                    context: streamEvent.context,
                    citations: streamEvent.citations,
                  }
                : message,
            ),
          );
        },
      );
      await loadChatSessions(token);
      setStatus("Answer generated.");
    } catch {
      setChatMessages((messages) =>
        messages.map((message) =>
          message.id === assistantMessageId && !message.content
            ? { ...message, content: "Chat failed. Please try again." }
            : message,
        ),
      );
      setStatus("Chat failed. Make sure at least one document has indexed chunks.");
    } finally {
      setIsAsking(false);
    }
  }

  async function handleLoadSession(sessionId: string) {
    if (!token) return;

    try {
      const session = await apiGet<ChatSessionDetail>(`/api/v1/chat/sessions/${sessionId}`, token);
      setChatSessionId(session.id);
      setChatMessages(session.messages);
      setStatus("Chat session loaded.");
    } catch {
      setStatus("Could not load chat session.");
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (!token) return;

    try {
      await apiDelete(`/api/v1/chat/sessions/${sessionId}`, token);
      setChatSessions((sessions) => sessions.filter((session) => session.id !== sessionId));
      if (chatSessionId === sessionId) {
        setChatSessionId(null);
        setChatMessages([]);
        setChatMessage("");
      }
      setStatus("Chat session deleted.");
    } catch {
      setStatus("Could not delete chat session.");
    }
  }

  function handleNewChat() {
    setChatSessionId(null);
    setChatMessages([]);
    setChatMessage("");
    setStatus("New chat started.");
  }

  function handleSignOut() {
    window.localStorage.removeItem(tokenStorageKey);
    setToken(null);
    setUser(null);
    setDocuments([]);
    setActiveDocument(null);
    setActivePages([]);
    setActiveChunks([]);
    setSelectedCitation(null);
    setSearchResults([]);
    setChatSessionId(null);
    setChatSessions([]);
    setChatMessages([]);
  }

  if (!token) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-gray-950 dark:bg-gray-950 dark:text-gray-50">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h1 className="text-2xl font-bold">Sign in required</h1>
          <p className="mt-3 text-gray-600 dark:text-gray-300">
            Your document workspace is tied to your account.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex rounded-md bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700"
          >
            Go to login
          </Link>
        </div>
      </main>
    );
  }

  const selectedSourceChunk = selectedCitation
    ? activeChunks.find((chunk) => isSelectedChunk(chunk))
    : undefined;
  const visibleChunks =
    selectedSourceChunk && !activeChunks.slice(0, 20).some((chunk) => chunk.id === selectedSourceChunk.id)
      ? [selectedSourceChunk, ...activeChunks.slice(0, 20)]
      : activeChunks.slice(0, 20);
  const accountInitial = user?.email?.slice(0, 1).toUpperCase() ?? "D";
  const activeChatTitle =
    chatSessions.find((session) => session.id === chatSessionId)?.title ?? "New chat";

  return (
    <main className="h-screen overflow-hidden bg-white text-gray-950 dark:bg-gray-950 dark:text-gray-50">
      <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-gray-950">
        <aside className="hidden w-[300px] shrink-0 flex-col border-r border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900 lg:flex">
          <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                {accountInitial}
              </div>
              <div className="min-w-0">
                <Link href="/" className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
                  AI问答
                </Link>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {user ? user.email : "Loading account..."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-white dark:border-gray-700 dark:hover:bg-gray-900"
            >
              Sign out
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-3">
            <form
              onSubmit={handleUpload}
              className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950"
            >
              <h2 className="text-sm font-semibold">上传说明书</h2>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                上传 PDF 或照片后即可问答。
              </p>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                className="mt-3 block w-full rounded-md border border-gray-300 bg-white text-xs file:mr-3 file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:font-semibold file:text-white hover:file:bg-blue-700 dark:border-gray-700 dark:bg-gray-900"
              />
              <button
                type="submit"
                disabled={!selectedFile || isUploading}
                className="mt-3 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isUploading ? "上传中..." : "上传"}
              </button>
            </form>

            <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <h2 className="text-sm font-semibold">会话管理</h2>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  新建
                </button>
              </div>
              {chatSessions.length > 0 ? (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {chatSessions.slice(0, 6).map((session) => (
                    <div
                      key={session.id}
                      className={`flex items-center gap-2 px-4 py-3 ${
                        chatSessionId === session.id
                          ? "bg-blue-50 text-blue-900 dark:bg-gray-800 dark:text-blue-300"
                          : "hover:bg-gray-50 dark:hover:bg-gray-900"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleLoadSession(session.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                          AI
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{session.title}</span>
                          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(session.updated_at)}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSession(session.id)}
                        className="shrink-0 rounded-full border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  暂无会话
                </div>
              )}
            </section>

            <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <h2 className="text-sm font-semibold">我的资料</h2>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  刷新
                </button>
              </div>
              {documents.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  暂无说明书
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {documents.map((document) => (
                    <article key={document.id} className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleOpen(document.id)}
                        className="block w-full truncate text-left text-sm font-medium hover:text-blue-600"
                      >
                        {document.original_filename}
                      </button>
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${statusTone(document.processing_status)}`}>
                            {document.processing_status}
                          </span>
                          <span className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {document.processing_stage}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-full bg-blue-600 transition-all"
                            style={{ width: `${document.processing_progress}%` }}
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleRetry(document.id)}
                          className="rounded-full border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                        >
                          重试
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(document.id)}
                          className="rounded-full border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                        >
                          删除
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {selectedCitation ? (
              <section className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900 dark:bg-gray-950">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-blue-700 dark:text-blue-300">当前来源</h2>
                    <p className="mt-2 text-sm text-gray-800 dark:text-gray-100">
                      [{selectedCitation.citation_id ?? selectedCitation.chunk_index + 1}] Page{" "}
                      {selectedCitation.page_number} | Chunk {selectedCitation.chunk_index}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCitation(null)}
                    className="rounded-full border border-blue-200 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-white dark:border-gray-700 dark:text-blue-300"
                  >
                    清除
                  </button>
                </div>
                {selectedSourceChunk ? (
                  <p className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-sm leading-6 text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                    {selectedSourceChunk.text}
                  </p>
                ) : null}
              </section>
            ) : null}
            </div>
          </div>
        </aside>

          <section className="flex min-w-0 flex-1 flex-col bg-white dark:bg-gray-950">
            <div className="grid h-[60px] grid-cols-[1fr_auto_1fr] items-center border-b border-gray-100 bg-white px-4 dark:border-gray-800 dark:bg-gray-950">
              <div className="min-w-0">
                <p className="hidden truncate text-xs text-gray-500 dark:text-gray-400 sm:block">
                  {activeChatTitle}
                </p>
              </div>
              <h1 className="text-xl font-bold tracking-normal text-gray-950 dark:text-gray-50">AI问答</h1>
              <button
                type="button"
                onClick={handleNewChat}
                className="justify-self-end text-base font-medium text-blue-600 hover:text-blue-700"
              >
                会话
              </button>
            </div>

            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto bg-white px-4 py-4 dark:bg-gray-950 sm:px-8"
            >
              {chatMessages.length === 0 ? (
                <div className="mx-auto flex h-full max-w-3xl items-center justify-center text-center">
                  <div className="px-6 py-5">
                    <h3 className="text-2xl font-semibold">开始一次 AI 问答</h3>
                    <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
                      上传说明书后，可以询问剂量、副作用、禁忌和相互作用。
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-4">
                  {chatMessages.map((message) => (
                    <article
                      key={message.id}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[78%] px-4 py-3 text-[17px] leading-8 sm:max-w-[72%] ${
                          message.role === "user"
                            ? "rounded-[12px] bg-blue-600 text-white"
                            : "rounded-[12px] bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100"
                        }`}
                      >
                        <p
                          className={`mb-1 text-xs font-semibold ${
                            message.role === "user"
                              ? "text-blue-100"
                              : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {message.role === "user" ? "你" : "AI"}
                        </p>
                        <p className="whitespace-pre-wrap">
                          {message.content || (message.role === "assistant" && isAsking ? "..." : "")}
                        </p>
                        {message.citations && message.citations.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {message.citations.map((citation) => (
                              <button
                                key={`${message.id}-${citation.chunk_index}-${citation.page_number}`}
                                type="button"
                                onClick={() => handleOpenCitation(citation)}
                                className="rounded bg-white px-2 py-1 text-left text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                              >
                                [{citation.citation_id ?? citation.chunk_index + 1}]{" "}
                                {citation.document_filename}, page {citation.page_number}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <form
              onSubmit={handleAsk}
              className="border-t border-gray-100 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-950"
            >
              {status ? (
                <p className="mx-auto mb-3 max-w-3xl rounded-lg bg-gray-50 px-4 py-2 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                  {status}
                </p>
              ) : null}
              <div className="mx-auto flex max-w-3xl gap-3">
                <textarea
                  value={chatMessage}
                  onChange={(event) => setChatMessage(event.target.value)}
                  placeholder="请输入问题..."
                  rows={2}
                  className="min-h-[48px] flex-1 resize-none border-0 border-b border-gray-100 bg-white px-0 py-3 text-base text-gray-950 outline-none placeholder:text-gray-400 focus:border-blue-500 dark:border-gray-800 dark:bg-gray-950 dark:text-white"
                />
                <button
                  type="submit"
                  disabled={!chatMessage.trim() || isAsking}
                  className="h-[62px] self-end rounded-md bg-blue-500 px-5 text-base font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isAsking ? "发送中" : "发送"}
                </button>
              </div>
              <nav className="mx-auto mt-3 grid max-w-3xl grid-cols-3 border-t border-gray-100 pt-2 text-center text-sm dark:border-gray-800 lg:hidden">
                <button type="button" className="text-blue-600">
                  AI问答
                </button>
                <button type="button" className="text-gray-800 dark:text-gray-200">
                  会话管理
                </button>
                <button type="button" className="text-gray-800 dark:text-gray-200">
                  我的
                </button>
              </nav>
            </form>
          </section>

          <section className="hidden">
            <div className="flex h-16 items-center justify-between border-b border-gray-200 bg-gray-100 px-4 dark:border-gray-800 dark:bg-gray-800">
              <h2 className="text-base font-semibold">Document info</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-white dark:border-gray-700 dark:hover:bg-gray-900"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="border-b border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                {documents.length} document{documents.length === 1 ? "" : "s"} available
              </div>

            {documents.length === 0 ? (
              <div className="px-5 py-12 text-center text-gray-600 dark:text-gray-300">
                No documents uploaded yet.
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-800">
                {documents.map((document) => (
                  <article
                    key={document.id}
                    className="px-4 py-4"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{document.original_filename}</h3>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {formatBytes(document.file_size)} | {document.content_type} |{" "}
                        {formatDate(document.created_at)}
                      </p>
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${statusTone(document.processing_status)}`}>
                            {document.processing_status}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {document.processing_stage}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-full bg-brand-600 transition-all"
                            style={{ width: `${document.processing_progress}%` }}
                          />
                        </div>
                        {document.error_message ? (
                          <p className="line-clamp-2 text-xs text-amber-700 dark:text-amber-300">
                            {document.error_message}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpen(document.id)}
                        className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(document.id)}
                        className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

              {searchResults.length > 0 ? (
                <section className="border-t border-gray-200 px-4 py-4 dark:border-gray-800">
                  <h3 className="text-sm font-semibold">Search results</h3>
                  <div className="mt-3 space-y-3">
                    {searchResults.map((result) => (
                      <article
                        key={`${result.citation_id}-${result.citation.chunk_index}`}
                        className="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-950"
                      >
                        <p className="line-clamp-3 leading-6 text-gray-800 dark:text-gray-100">
                          {result.text}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleOpenCitation(result.citation)}
                          className="mt-2 text-left text-xs font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
                        >
                          [{result.citation_id}] Page {result.citation.page_number} | Chunk{" "}
                          {result.citation.chunk_index}
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeDocument ? (
                <section className="border-t border-gray-200 px-4 py-4 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">
                        {activeDocument.original_filename}
                      </h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {activePages.length} pages | {activeChunks.length} chunks
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRetry(activeDocument.id)}
                      className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                    >
                      Reprocess
                    </button>
                  </div>

                  {selectedCitation ? (
                    <section className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-gray-800">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                            Selected source
                          </h4>
                          <p className="mt-2 text-sm text-gray-800 dark:text-gray-100">
                            [{selectedCitation.citation_id ?? selectedCitation.chunk_index + 1}] Page{" "}
                            {selectedCitation.page_number} | Chunk {selectedCitation.chunk_index}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedCitation(null)}
                          className="rounded-full border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-white dark:border-gray-700 dark:text-emerald-300 dark:hover:bg-gray-900"
                        >
                          Clear
                        </button>
                      </div>
                      {selectedSourceChunk ? (
                        <p className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white p-3 text-sm leading-6 text-gray-800 dark:bg-gray-950 dark:text-gray-100">
                          {selectedSourceChunk.text}
                        </p>
                      ) : null}
                    </section>
                  ) : null}

                  <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs leading-5 text-gray-700 dark:bg-gray-950 dark:text-gray-200">
                    {activeDocument.extracted_text || "No extracted text yet."}
                  </pre>

                  {visibleChunks.length > 0 ? (
                    <div className="mt-4 max-h-72 divide-y divide-gray-200 overflow-auto rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                      {visibleChunks.map((chunk) => (
                        <div
                          key={chunk.id}
                          className={`p-3 text-xs ${
                            isSelectedChunk(chunk) ? "bg-emerald-50 dark:bg-gray-800" : ""
                          }`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-2 text-gray-500 dark:text-gray-400">
                            <span>
                              Chunk {chunk.chunk_index} | Page {chunk.page_number}
                            </span>
                            <span>{chunk.embedding_status}</span>
                          </div>
                          <p className="line-clamp-4 text-gray-700 dark:text-gray-200">{chunk.text}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {status ? (
                <p className="m-4 rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-700 dark:bg-gray-950 dark:text-gray-200">
                  {status}
                </p>
              ) : null}
            </div>
          </section>

      </div>
    </main>
  );
}
