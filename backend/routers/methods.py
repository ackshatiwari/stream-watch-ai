from fastapi import APIRouter

router = APIRouter()


@router.get("/test")
def test(name: str):
    return f"hello, {name}"
