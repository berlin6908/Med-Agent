"""add document processing progress

Revision ID: 0005_document_progress
Revises: 0004_chat_tables
Create Date: 2026-05-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_document_progress"
down_revision = "0004_chat_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("processing_stage", sa.String(length=100), nullable=False, server_default="Waiting"),
    )
    op.add_column(
        "documents",
        sa.Column("processing_progress", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("documents", "processing_progress")
    op.drop_column("documents", "processing_stage")
