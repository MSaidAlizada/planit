from fastapi import APIRouter, Depends

from app.api.tasks import router as tasks_router
from app.api.subtasks import router as subtasks_router
from app.api.calendar import router as calendar_router
from app.api.schedule import router as schedule_router
from app.api.preferences import router as preferences_router
from app.api.habits import router as habits_router
from app.api.categories import router as categories_router
from app.api.contexts import router as contexts_router
from app.api.feeds import router as feeds_router
from app.api.google_auth import api_router as google_router
from app.api.digest import router as digest_router
from app.core.deps import get_current_user

api_router = APIRouter(dependencies=[Depends(get_current_user)])
api_router.include_router(tasks_router)
api_router.include_router(subtasks_router)
api_router.include_router(calendar_router)
api_router.include_router(schedule_router)
api_router.include_router(preferences_router)
api_router.include_router(habits_router)
api_router.include_router(categories_router)
api_router.include_router(contexts_router)
api_router.include_router(feeds_router)
api_router.include_router(google_router)
api_router.include_router(digest_router)


@api_router.get("/status")
def status() -> dict[str, str]:
    return {"service": "planit", "status": "ready"}
