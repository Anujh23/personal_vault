import ssl
import asyncpg
import logging
from config import DATABASE_URL

logger = logging.getLogger(__name__)

pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        await init_pool()
    return pool


async def init_pool():
    global pool

    kwargs = dict(
        dsn=DATABASE_URL,
        min_size=1,
        max_size=5,
        command_timeout=30,
    )

    # SSL for Render
    if "render.com" in DATABASE_URL:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        kwargs["ssl"] = ctx

    retries = 5
    for attempt in range(1, retries + 1):
        try:
            pool = await asyncpg.create_pool(**kwargs)
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT current_database(), current_user"
                )
                logger.info("Connected to PostgreSQL: %s", dict(row))
            return
        except Exception as e:
            logger.error("Connection attempt %d failed: %s", attempt, e)
            if attempt == retries:
                raise
            import asyncio
            await asyncio.sleep(5)


async def close_pool():
    global pool
    if pool:
        await pool.close()
        pool = None
        logger.info("PostgreSQL pool closed")


async def query(sql: str, *args):
    """Execute a query and return list of Record objects."""
    p = await get_pool()
    async with p.acquire() as conn:
        return await conn.fetch(sql, *args)


async def query_one(sql: str, *args):
    """Execute a query and return a single Record or None."""
    p = await get_pool()
    async with p.acquire() as conn:
        return await conn.fetchrow(sql, *args)


async def execute(sql: str, *args):
    """Execute a statement (INSERT/UPDATE/DELETE) without returning rows."""
    p = await get_pool()
    async with p.acquire() as conn:
        return await conn.execute(sql, *args)
