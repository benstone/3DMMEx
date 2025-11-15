/*
 * Windows platform functions
 */

#include <windows.h>
#include "platform.h"

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
