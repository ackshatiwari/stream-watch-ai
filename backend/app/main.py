from fastapi import FastAPI

from routers import methods

app = FastAPI()

app.include_router(methods.router)
