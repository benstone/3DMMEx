/***************************************************************************
    Author:
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Entry point for a Kauai GUI application

***************************************************************************/

#include "frame.h"

ASSERTNAME

#ifdef WIN32

extern WIG vwig;

/***************************************************************************
    WinMain for any frame work app. Sets up vwig and calls FrameMain.
***************************************************************************/
int WINAPI WinMain(HINSTANCE hinst, HINSTANCE hinstPrev, LPSTR pszs, int wShow)
{
    vwig.hinst = hinst;
    vwig.hinstPrev = hinstPrev;
    vwig.pszCmdLine = GetCommandLine();
    vwig.wShow = wShow;
    vwig.tidMain = std::this_thread::get_id();
#ifdef DEBUG
    APPB::CreateConsole();
#endif

#ifdef _MSC_VER
    // Prevent the MSVC C runtime showing a dialog box on abort()
    _set_abort_behavior(0, _WRITE_ABORT_MSG);
#endif // _MSC_VER

    // Get argc/argv from MSVC CRT globals
#ifdef _MSC_VER
#ifdef UNICODE
    vpappb->SetArgv(__wargv, __argc);
#else  // !UNICODE
    vpappb->SetArgv(__argv, __argc);
#endif // UNICODE
#endif // _MSC_VER

    int32_t lwExitCode = FrameMain();
    SDL_Quit();
    return lwExitCode;
}

#else // !WIN32

/***************************************************************************
    Entrypoint for frame work app. Calls FrameMain.
***************************************************************************/

int main(int argc, char *argv[])
{
#ifdef DEBUG
    APPB::CreateConsole();
#endif
    vpappb->SetArgv(argv, argc);
    int32_t lwExitCode = FrameMain();
    SDL_Quit();
    return lwExitCode;
}

#endif // WIN32
