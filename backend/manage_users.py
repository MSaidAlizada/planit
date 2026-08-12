"""Admin CLI: list users and delete accounts (with all their data).

Usage (on the Pi, inside the backend container):
    docker compose exec backend python manage_users.py list
    docker compose exec backend python manage_users.py delete <username>
    docker compose exec backend python manage_users.py delete <username> --yes
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from sqlmodel import select

from app.db import get_session, init_db
from app.models import User
from app.services.user_service import delete_user_and_data


def list_users() -> None:
    with get_session() as session:
        users = session.exec(select(User).order_by(User.created_at)).all()
        if not users:
            print("No users.")
            return
        print(f"{'USERNAME':<20} {'DISPLAY NAME':<20} {'ADMIN':<6} {'CREATED':<20} ID")
        for user in users:
            print(
                f"{user.username:<20} {user.display_name:<20} "
                f"{'yes' if user.is_admin else 'no':<6} {user.created_at.isoformat():<20} {user.id}"
            )


def delete_user(username: str, skip_confirm: bool) -> None:
    normalized = username.strip().lower()
    with get_session() as session:
        user = session.exec(select(User).where(User.username == normalized)).first()
        if not user:
            print(f"No user named '{username}'.")
            sys.exit(1)

        if not skip_confirm:
            reply = input(
                f"Delete user '{user.username}' (id={user.id}) and ALL their data "
                f"(tasks, habits, calendar events, etc.)? Type 'yes' to confirm: "
            )
            if reply.strip().lower() != "yes":
                print("Cancelled.")
                return

        counts = delete_user_and_data(session, user)
        session.commit()
        print(f"Deleted user '{username}'. Removed: {counts}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage planit users.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List all users.")

    delete_parser = subparsers.add_parser("delete", help="Delete a user and all their data.")
    delete_parser.add_argument("username")
    delete_parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt.")

    args = parser.parse_args()

    init_db()
    if args.command == "list":
        list_users()
    elif args.command == "delete":
        delete_user(args.username, args.yes)


if __name__ == "__main__":
    main()
