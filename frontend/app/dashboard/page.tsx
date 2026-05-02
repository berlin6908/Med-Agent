"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { apiDelete, apiGet, apiPost, apiPostStream, apiUpload } from "@/lib/api";

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

type RetrievalResponse = {
  query: string;
  context: string;
  results: RetrievalResult[];
};

type ChatResponse = {
  session_id: string;
  answer: string;
  citations: RetrievalResult["citation"][];
  context: string;
};

type ChatStreamEvent =
  | { type: "session"; session_id: string }
  | { type: "token"; text: string }
  | {
      type: "done";
      session_id: string;
      answer: string;
      citations: RetrievalResult["citation"][];
      context: string;
    };

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  context: string | null;
  citations: RetrievalResult["citation"][] | null;
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
  const [chatResponse, setChatResponse] = useState<ChatResponse | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<string | null>("Loading workspace...");
  const [isUploading, setIsUploading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

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

  async function handleOpen(documentId: string) {
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
      setStatus(null);
    } catch {
      setStatus("Could not load document details.");
    }
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
    setChatResponse(null);
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

          setChatResponse({
            session_id: streamEvent.session_id,
            answer: streamEvent.answer,
            citations: streamEvent.citations,
            context: streamEvent.context,
          });
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
      setChatResponse(null);
      setStatus("Chat session loaded.");
    } catch {
      setStatus("Could not load chat session.");
    }
  }

  function handleNewChat() {
    setChatSessionId(null);
    setChatMessages([]);
    setChatResponse(null);
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
    setSearchResults([]);
    setChatResponse(null);
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

  return (
    <main className="min-h-screen bg-gray-50 text-gray-950 dark:bg-gray-950 dark:text-gray-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-6 dark:border-gray-800">
          <div>
            <Link href="/" className="text-sm font-semibold text-brand-600 dark:text-brand-500">
              Drug Leaflet Agent
            </Link>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Document workspace</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              {user ? user.email : "Loading account..."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-white dark:border-gray-700 dark:hover:bg-gray-900"
          >
            Sign out
          </button>
        </header>

        <section className="grid gap-6 py-8 lg:grid-cols-[360px_1fr]">
          <div className="space-y-6">
            <form
              onSubmit={handleUpload}
              className="h-fit rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <h2 className="text-lg font-semibold">Upload leaflet</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                Add a PDF or image. PDFs with selectable text are processed in the background.
              </p>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                className="mt-5 block w-full rounded-md border border-gray-300 bg-white text-sm file:mr-4 file:border-0 file:bg-brand-600 file:px-4 file:py-2.5 file:font-semibold file:text-white hover:file:bg-brand-700 dark:border-gray-700 dark:bg-gray-950"
              />
              <button
                type="submit"
                disabled={!selectedFile || isUploading}
                className="mt-5 w-full rounded-md bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isUploading ? "Uploading..." : "Upload"}
              </button>
            </form>

            <form
              onSubmit={handleSearch}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <h2 className="text-lg font-semibold">Search chunks</h2>
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="dosage, side effects, interactions"
                className="mt-4 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-950 outline-none ring-brand-600 focus:ring-2 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
              />
              <button
                type="submit"
                disabled={!searchQuery.trim() || isSearching}
                className="mt-4 w-full rounded-md bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSearching ? "Searching..." : "Search"}
              </button>
            </form>

            <form
              onSubmit={handleAsk}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
            >
              <h2 className="text-lg font-semibold">Ask documents</h2>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  New chat
                </button>
                <span className="truncate py-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {chatSessionId ? "Session saved" : "Unsaved session"}
                </span>
              </div>
              <textarea
                value={chatMessage}
                onChange={(event) => setChatMessage(event.target.value)}
                placeholder="What is the recommended dosage?"
                rows={4}
                className="mt-4 w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-950 outline-none ring-brand-600 focus:ring-2 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
              />
              <button
                type="submit"
                disabled={!chatMessage.trim() || isAsking}
                className="mt-4 w-full rounded-md bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isAsking ? "Answering..." : "Ask"}
              </button>
            </form>

            {chatSessions.length > 0 ? (
              <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <h2 className="text-lg font-semibold">Recent chats</h2>
                <div className="mt-4 space-y-2">
                  {chatSessions.slice(0, 6).map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => handleLoadSession(session.id)}
                      className={`block w-full truncate rounded-md border px-3 py-2 text-left text-sm ${
                        chatSessionId === session.id
                          ? "border-brand-600 bg-brand-50 text-brand-700 dark:bg-gray-800 dark:text-brand-500"
                          : "border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                      }`}
                    >
                      {session.title}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h2 className="text-lg font-semibold">Documents</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  Refresh
                </button>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {documents.length} total
                </span>
              </div>
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
                    className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{document.original_filename}</h3>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        {formatBytes(document.file_size)} | {document.content_type} |{" "}
                        {formatDate(document.created_at)}
                      </p>
                      <span className="mt-3 inline-flex rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        {document.processing_status}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpen(document.id)}
                        className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(document.id)}
                        className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>

        {chatMessages.length > 0 ? (
          <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-lg font-semibold">Chat</h2>
            <div className="mt-4 space-y-4">
              {chatMessages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-md p-4 ${
                    message.role === "user"
                      ? "bg-brand-50 text-brand-950 dark:bg-gray-800 dark:text-gray-50"
                      : "bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {message.role}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  {message.citations && message.citations.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.citations.map((citation) => (
                        <span
                          key={`${message.id}-${citation.chunk_index}-${citation.page_number}`}
                          className="rounded bg-white px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        >
                          [{citation.citation_id ?? citation.chunk_index + 1}] {citation.document_filename}, page{" "}
                          {citation.page_number}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : chatResponse ? (
          <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h2 className="text-lg font-semibold">Answer</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-gray-800 dark:text-gray-100">
              {chatResponse.answer}
            </p>
            {chatResponse.citations.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">
                  Citations
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {chatResponse.citations.map((citation) => (
                    <span
                      key={`${citation.chunk_index}-${citation.page_number}`}
                      className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    >
                      [{citation.citation_id ?? citation.chunk_index + 1}] {citation.document_filename}, page{" "}
                      {citation.page_number}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {searchResults.length > 0 ? (
          <section className="mb-8 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h2 className="text-lg font-semibold">Search results</h2>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {searchResults.map((result) => (
                <article key={`${result.citation_id}-${result.citation.chunk_index}`} className="px-5 py-4">
                  <p className="text-sm leading-6 text-gray-800 dark:text-gray-100">
                    {result.text}
                  </p>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    [{result.citation_id}] {result.citation.document_filename} | Page{" "}
                    {result.citation.page_number} | Chunk {result.citation.chunk_index} | Score{" "}
                    {result.citation.score.toFixed(4)}
                    {result.citation.rerank_score !== undefined && result.citation.rerank_score !== null
                      ? ` | Rerank ${result.citation.rerank_score.toFixed(4)}`
                      : ""}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeDocument ? (
          <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{activeDocument.original_filename}</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  Status: {activeDocument.processing_status}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  {activePages.length} pages | {activeChunks.length} chunks ready for retrieval
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRetry(activeDocument.id)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Reprocess
              </button>
            </div>

            {activeDocument.error_message ? (
              <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                {activeDocument.error_message}
              </p>
            ) : null}

            <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-gray-100 p-4 text-sm leading-6 text-gray-800 dark:bg-gray-950 dark:text-gray-100">
              {activeDocument.extracted_text || "No extracted text yet."}
            </pre>

            {activePages.length > 0 ? (
              <div className="mt-5 space-y-4">
                <h3 className="text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">
                  Pages
                </h3>
                {activePages.map((page) => (
                  <article
                    key={page.id}
                    className="rounded-md border border-gray-200 p-4 dark:border-gray-800"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-medium">Page {page.page_number}</h4>
                      <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        {page.extraction_method}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-200">
                      {page.text}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}

            {activeChunks.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">
                  Retrieval chunks
                </h3>
                <div className="mt-3 max-h-72 divide-y divide-gray-200 overflow-auto rounded-md border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
                  {activeChunks.slice(0, 20).map((chunk) => (
                    <div key={chunk.id} className="p-3 text-sm">
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          Chunk {chunk.chunk_index} | Page {chunk.page_number}
                        </span>
                        <span>{chunk.embedding_status}</span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-200">{chunk.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {status ? (
          <p className="rounded-md bg-gray-100 px-4 py-3 text-sm text-gray-700 dark:bg-gray-900 dark:text-gray-200">
            {status}
          </p>
        ) : null}
      </div>
    </main>
  );
}
