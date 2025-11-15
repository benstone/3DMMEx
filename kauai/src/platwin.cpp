/*
 * Windows platform functions
 */

#include <windows.h>
#include "platform.h"
#if defined(KAUAI_SDL)
#include <SDL.h>
#endif

/****************************************
    Mutex (critical section) object
****************************************/

MUTX::MUTX(void)
{
    CRITICAL_SECTION *_crit;

    opaque = GlobalAlloc(GMEM_FIXED, sizeof(CRITICAL_SECTION));
    _crit = (CRITICAL_SECTION *)opaque;

    InitializeCriticalSection(_crit);
}

MUTX::~MUTX(void)
{
    CRITICAL_SECTION *_crit = (CRITICAL_SECTION *)opaque;

    DeleteCriticalSection(_crit);
    GlobalFree(_crit);
}

void MUTX::Enter(void)
{
    CRITICAL_SECTION *_crit = (CRITICAL_SECTION *)opaque;

    EnterCriticalSection(_crit);
}

void MUTX::Leave(void)
{
    CRITICAL_SECTION *_crit = (CRITICAL_SECTION *)opaque;

    LeaveCriticalSection(_crit);
}

/****************************************
    Current thread id
****************************************/
uint32_t LwThreadCur(void)
{
    return GetCurrentThreadId();
}

/***************************************************************************
    Universal scalable application clock and other time stuff
***************************************************************************/
const uint32_t kdtsSecond = 1000;

uint32_t TsCurrentSystem(void)
{
#if defined(KAUAI_WIN32)
    // n.b. WIN: timeGetTime is more accurate than GetTickCount
    return timeGetTime();
#elif defined(KAUAI_SDL)
    return SDL_GetTicks();
#else
    RawRtn();
    return 0;
#endif
}
