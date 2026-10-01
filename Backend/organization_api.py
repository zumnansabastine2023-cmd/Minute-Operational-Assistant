"""Company administration using the existing verified Supabase subject."""
import hashlib
import secrets
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

try:
    from .workspaces import Organization, OrganizationMembership, OrganizationInvite, OrganizationJoinRequest, require_organization_member, require_organization_admin, utc
except ImportError:
    from workspaces import Organization, OrganizationMembership, OrganizationInvite, OrganizationJoinRequest, require_organization_member, require_organization_admin, utc


class CompanyName(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(max_length=120)

    @field_validator('name')
    @classmethod
    def valid_name(cls, value):
        if any(unicodedata.category(char).startswith('C') for char in value):
            raise ValueError('Company name cannot contain control characters.')
        value = value.strip()
        if not value:
            raise ValueError('Enter a company name.')
        return value


class MemberRole(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: Literal['admin', 'member']


class JoinDecision(BaseModel):
    model_config = ConfigDict(extra='forbid')
    decision: Literal['approve', 'decline']


class RedeemInvite(BaseModel):
    model_config = ConfigDict(extra='forbid')
    token: str = Field(min_length=32, max_length=128, pattern=r'^[A-Za-z0-9_-]+$')


def organization_response(organization, membership):
    return {'id': str(organization.id), 'name': organization.name, 'role': membership.role,
            'created_at': organization.created_at}


def organization_router(get_engine, get_user):
    router = APIRouter(prefix='/organizations', tags=['Company workspaces'])

    # Keeping failures at this boundary prevents SQL/driver details reaching UI.
    def database():
        try:
            with Session(get_engine()) as session:
                yield session
        except SQLAlchemyError as error:
            raise HTTPException(503, 'Company workspace is unavailable. Please retry.') from error

    @router.get('')
    def organizations(user=Depends(get_user), session=Depends(database)):
        rows = session.execute(select(Organization, OrganizationMembership).join(
            OrganizationMembership, OrganizationMembership.organization_id == Organization.id
        ).where(OrganizationMembership.user_id == user.id).order_by(Organization.name, Organization.id)).all()
        return [organization_response(org, member) for org, member in rows]

    @router.post('', status_code=201)
    def create(request: CompanyName, user=Depends(get_user), session=Depends(database)):
        organization = Organization(name=request.name, created_by=user.id)
        session.add(organization)
        session.flush()
        membership = OrganizationMembership(organization_id=organization.id, user_id=user.id,
            display_name=user.display_name or 'Member', email=user.email or None, role='admin')
        session.add(membership)
        session.commit()
        return organization_response(organization, membership)

    @router.post('/join')
    def join(request: RedeemInvite, user=Depends(get_user), session=Depends(database)):
        digest = hashlib.sha256(request.token.encode()).hexdigest()
        invite = session.scalar(select(OrganizationInvite).where(OrganizationInvite.token_hash == digest))
        if invite is None:
            raise HTTPException(400, 'Invitation is invalid, expired or already used.')
        # All membership mutations take the same organization lock first.
        organization = session.scalar(select(Organization).where(Organization.id == invite.organization_id).with_for_update())
        invite = session.scalar(select(OrganizationInvite).where(OrganizationInvite.token_hash == digest)
                                .with_for_update().execution_options(populate_existing=True))
        if organization is None or invite is None or utc(invite.expires_at) <= datetime.now(timezone.utc):
            raise HTTPException(400, 'Invitation is invalid, expired or already used.')
        issuer = session.scalar(select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization.id,
            OrganizationMembership.user_id == invite.created_by, OrganizationMembership.role == 'admin'))
        if issuer is None:
            raise HTTPException(400, 'Invitation is no longer active. Ask an admin for a new one.')
        membership = session.scalar(select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization.id, OrganizationMembership.user_id == user.id))
        if membership is not None:
            raise HTTPException(409, 'You already belong to this company.')
        pending = session.scalar(select(OrganizationJoinRequest).where(
            OrganizationJoinRequest.organization_id == organization.id, OrganizationJoinRequest.user_id == user.id))
        if pending is not None and pending.status == 'pending':
            raise HTTPException(409, 'Your request is already waiting for approval.')
        if pending is None:
            pending = OrganizationJoinRequest(organization_id=organization.id, user_id=user.id)
            session.add(pending)
        pending.display_name = user.display_name or 'Member'
        pending.email = user.email or None
        pending.status = 'pending'
        pending.created_at = datetime.now(timezone.utc)
        pending.reviewed_at = None
        pending.reviewed_by = None
        session.delete(invite)  # Consume the single-use token atomically with the request.
        session.commit()
        return {'id': str(pending.id), 'organization_name': organization.name, 'status': 'pending'}

    @router.get('/join-requests')
    def own_requests(user=Depends(get_user), session=Depends(database)):
        rows = session.execute(select(OrganizationJoinRequest, Organization).join(Organization,
            Organization.id == OrganizationJoinRequest.organization_id).where(OrganizationJoinRequest.user_id == user.id)).all()
        return [{'id': str(row.id), 'organization_name': org.name, 'status': row.status,
                 'created_at': row.created_at} for row, org in rows]

    @router.get('/{organization_id}/join-requests')
    def pending_requests(organization_id: UUID, user=Depends(get_user), session=Depends(database)):
        require_organization_admin(session, organization_id, user.id)
        rows = session.scalars(select(OrganizationJoinRequest).where(
            OrganizationJoinRequest.organization_id == organization_id,
            OrganizationJoinRequest.status == 'pending').order_by(OrganizationJoinRequest.created_at)).all()
        return [{'id': str(row.id), 'identity': row.display_name, 'email': row.email,
                 'created_at': row.created_at, 'status': row.status} for row in rows]

    @router.patch('/{organization_id}/join-requests/{request_id}')
    def review_request(organization_id: UUID, request_id: UUID, request: JoinDecision,
                       user=Depends(get_user), session=Depends(database)):
        require_organization_admin(session, organization_id, user.id, lock=True)
        pending = session.scalar(select(OrganizationJoinRequest).where(
            OrganizationJoinRequest.id == request_id, OrganizationJoinRequest.organization_id == organization_id).with_for_update())
        if pending is None:
            raise HTTPException(404, 'Join request not found.')
        if pending.status != 'pending':
            raise HTTPException(409, 'This request has already been reviewed.')
        if request.decision == 'approve':
            membership = session.scalar(select(OrganizationMembership).where(
                OrganizationMembership.organization_id == organization_id, OrganizationMembership.user_id == pending.user_id))
            if membership is None:
                session.add(OrganizationMembership(organization_id=organization_id, user_id=pending.user_id,
                    display_name=pending.display_name, email=pending.email, role='member'))
            pending.status = 'approved'
        else:
            pending.status = 'declined'
        pending.reviewed_at = datetime.now(timezone.utc)
        pending.reviewed_by = user.id
        session.commit()
        return {'status': pending.status}

    @router.get('/{organization_id}')
    def details(organization_id: UUID, user=Depends(get_user), session=Depends(database)):
        organization, membership = require_organization_member(session, organization_id, user.id)
        count = session.scalar(select(func.count()).select_from(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id))
        return {**organization_response(organization, membership), 'member_count': count}

    @router.patch('/{organization_id}')
    def rename(organization_id: UUID, request: CompanyName, user=Depends(get_user), session=Depends(database)):
        organization, membership = require_organization_admin(session, organization_id, user.id, lock=True)
        organization.name = request.name
        session.commit()
        return organization_response(organization, membership)

    @router.get('/{organization_id}/members')
    def members(organization_id: UUID, user=Depends(get_user), session=Depends(database)):
        require_organization_member(session, organization_id, user.id)
        rows = session.scalars(select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id).order_by(OrganizationMembership.created_at)).all()
        return [{'id': str(row.id), 'user_id': row.user_id, 'identity': row.display_name, 'email': row.email,
                 'role': row.role, 'created_at': row.created_at} for row in rows]

    def modify_member(organization_id, membership_id, user, session, role=None):
        require_organization_admin(session, organization_id, user.id, lock=True)
        target = session.scalar(select(OrganizationMembership).where(
            OrganizationMembership.id == membership_id, OrganizationMembership.organization_id == organization_id))
        if target is None:
            raise HTTPException(404, 'Company member not found.')
        if target.role == 'admin' and role != 'admin':
            admins = session.scalar(select(func.count()).select_from(OrganizationMembership).where(
                OrganizationMembership.organization_id == organization_id, OrganizationMembership.role == 'admin'))
            if admins <= 1:
                raise HTTPException(409, 'Keep at least one Company Admin. Promote another member first.')
        if role is None:
            session.delete(target)
        else:
            target.role = role
        # A revoked/demoted admin's previously issued tokens must not revive if
        # they are promoted again later.
        if role != 'admin':
            for invite in session.scalars(select(OrganizationInvite).where(
                    OrganizationInvite.organization_id == organization_id, OrganizationInvite.created_by == target.user_id)):
                session.delete(invite)
        session.commit()
        return {'updated': True}

    @router.patch('/{organization_id}/members/{membership_id}')
    def change_role(organization_id: UUID, membership_id: UUID, request: MemberRole,
                    user=Depends(get_user), session=Depends(database)):
        return modify_member(organization_id, membership_id, user, session, request.role)

    @router.delete('/{organization_id}/members/{membership_id}')
    def remove(organization_id: UUID, membership_id: UUID, user=Depends(get_user), session=Depends(database)):
        return modify_member(organization_id, membership_id, user, session)

    @router.post('/{organization_id}/invites', status_code=201)
    def invite(organization_id: UUID, user=Depends(get_user), session=Depends(database)):
        require_organization_admin(session, organization_id, user.id, lock=True)
        token = secrets.token_urlsafe(32)
        row = OrganizationInvite(organization_id=organization_id, token_hash=hashlib.sha256(token.encode()).hexdigest(),
            created_by=user.id, expires_at=datetime.now(timezone.utc) + timedelta(days=7))
        session.add(row)
        session.commit()
        return {'id': str(row.id), 'token': token, 'expires_at': row.expires_at}

    @router.get('/{organization_id}/invites')
    def invites(organization_id: UUID, user=Depends(get_user), session=Depends(database)):
        require_organization_admin(session, organization_id, user.id)
        rows = session.scalars(select(OrganizationInvite).where(OrganizationInvite.organization_id == organization_id,
            OrganizationInvite.expires_at > datetime.now(timezone.utc))).all()
        return [{'id': str(row.id), 'created_at': row.created_at, 'expires_at': row.expires_at} for row in rows]

    @router.delete('/{organization_id}/invites/{invite_id}')
    def revoke(organization_id: UUID, invite_id: UUID, user=Depends(get_user), session=Depends(database)):
        require_organization_admin(session, organization_id, user.id, lock=True)
        invite = session.scalar(select(OrganizationInvite).where(OrganizationInvite.id == invite_id,
            OrganizationInvite.organization_id == organization_id))
        if invite is None:
            raise HTTPException(404, 'Invitation not found.')
        session.delete(invite)
        session.commit()
        return {'revoked': True}

    return router
