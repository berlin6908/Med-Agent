import logging
from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from app.agent.answer_agent import SAFE_FALLBACK_ANSWER, answer_node, fallback_node
from app.agent.citation_verifier_agent import citation_verifier_node
from app.agent.query_understanding_agent import query_understanding_node
from app.agent.retrieval_agent import retrieval_node, route_context_node
from app.agent.state import RagState

logger = logging.getLogger(__name__)

# Backwards-compatible node aliases for tests and older imports.
retrieve_node = retrieval_node
citation_check_node = citation_verifier_node


@lru_cache
def get_rag_graph():
    graph = StateGraph(RagState)
    graph.add_node("query_understanding", query_understanding_node)
    graph.add_node("retrieval", retrieval_node)
    graph.add_node("answer", answer_node)
    graph.add_node("fallback", fallback_node)
    graph.add_node("citation_verifier", citation_verifier_node)

    graph.add_edge(START, "query_understanding")
    graph.add_edge("query_understanding", "retrieval")
    graph.add_conditional_edges(
        "retrieval",
        route_context_node,
        {
            "answer": "answer",
            "fallback": "fallback",
        },
    )
    graph.add_edge("answer", "citation_verifier")
    graph.add_edge("fallback", "citation_verifier")
    graph.add_edge("citation_verifier", END)
    return graph.compile()


def invoke_rag_graph(user_id: str, question: str, top_k: int | None = None) -> RagState:
    logger.info("rag_graph_started user_id=%s", user_id)
    return get_rag_graph().invoke(
        {
            "user_id": user_id,
            "question": question,
            "top_k": top_k,
        }
    )


def retrieve_for_rag(user_id: str, question: str, top_k: int | None = None) -> RagState:
    state: RagState = {
        "user_id": user_id,
        "question": question,
        "top_k": top_k,
    }
    state = query_understanding_node(state)
    return retrieval_node(state)
