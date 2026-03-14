/***************************************************************************
    Author:
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Entry point for a Kauai GUI application

***************************************************************************/

#include "frame.h"

ASSERTNAME

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
    FrameMain();
    return 0;
}
