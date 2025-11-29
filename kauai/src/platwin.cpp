/*
 * Windows platform functions
 */

#include <windows.h>
#include <shlobj.h>
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

uint32_t DtsCaret(void)
{
#if defined(KAUAI_WIN32)
    return GetCaretBlinkTime();
#elif defined(KAUAI_SDL)
    // Return the default caret blink time on Windows
    const uint32_t kdtsCaret = 530; // milliseconds
    return kdtsCaret;
#else
    RawRtn();
    return 0;
#endif
}

bool FGetAppConfigDir(char *psz, int32_t cchMax)
{
    HRESULT hr;
    char szPath[MAX_PATH];
    size_t cchPath;

    if (cchMax <= 0)
        return false;

    psz[0] = 0;

    // Get the path to the roaming AppData directory
    hr = SHGetFolderPathA(NULL, CSIDL_APPDATA, NULL, 0, szPath);
    if (FAILED(hr))
        return false;

    cchPath = strlen(szPath);
    if (cchPath >= cchMax)
        return false;

    memcpy(psz, szPath, cchPath + 1);
    return true;
}