"""Additive workspace models and database-backed authorization.

Membership changes serialize on the organization row, including last-admin checks.
Tokens are bearer invitations for existing authenticated users, never auth accounts.
"""
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint, Uuid, func, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OrganizationMembership(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_organization_user"),
                     CheckConstraint("role IN ('admin', 'member')", name="ck_organization_role"))
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrganizationInvite(Base):
    __tablename__ = "organization_invites"
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OrganizationJoinRequest(Base):
    __tablename__ = "organization_join_requests"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_join_request_user"),
                     CheckConstraint("status IN ('pending', 'approved', 'declined')", name="ck_join_request_status"))
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    organization_id: Mapped[UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)


def require_organization_member(session, organization_id, user_id, *, admin=False, lock=False):
    statement = select(Organization).where(Organization.id == organization_id)
    if lock:
        statement = statement.with_for_update()
    organization = session.scalar(statement)
    if organization is None:
        raise HTTPException(404, "Company workspace not found.")
    membership = session.scalar(select(OrganizationMembership).where(
        OrganizationMembership.organization_id == organization_id,
        OrganizationMembership.user_id == user_id,
    ).execution_options(populate_existing=True))
    if membership is None:
        raise HTTPException(403, "You no longer have access to this company workspace.")
    if admin and membership.role != "admin":
        raise HTTPException(403, "Company Admin access is required.")
    return organization, membership


def require_organization_admin(session, organization_id, user_id, *, lock=False):
    return require_organization_member(session, organization_id, user_id, admin=True, lock=lock)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
