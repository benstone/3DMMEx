/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Declarations related to key handling

***************************************************************************/
#ifndef KEYS_H
#define KEYS_H

#define vkNil 0

#if defined(KAUAI_SDL)
#define kvkLeft SDLK_LEFT
#define kvkRight SDLK_RIGHT
#define kvkUp SDLK_UP
#define kvkDown SDLK_DOWN
#define kvkHome SDLK_HOME
#define kvkEnd SDLK_END
#define kvkPageUp SDLK_PAGEUP
#define kvkPageDown SDLK_PAGEDOWN
#define kvkBack SDLK_BACKSPACE
#define kvkDelete SDLK_DELETE
#define kvkReturn SDLK_RETURN

#define kvkF1 SDLK_F1
#define kvkF2 SDLK_F2
#define kvkF3 SDLK_F3
#define kvkF4 SDLK_F4
#define kvkF5 SDLK_F5
#define kvkF6 SDLK_F6
#define kvkF7 SDLK_F7
#define kvkF8 SDLK_F8
#define kvkF9 SDLK_F9
#define kvkF10 SDLK_F10
#define kvkF11 SDLK_F11
#define kvkF12 SDLK_F12

#define VK_FROM_ALPHA(ch) (ch - 'A' + SDLK_a)

#elif defined(KAUAI_WIN32)

#define kvkLeft MacWin(0x1C, VK_LEFT)
#define kvkRight MacWin(0x1D, VK_RIGHT)
#define kvkUp MacWin(0x1E, VK_UP)
#define kvkDown MacWin(0x1F, VK_DOWN)
#define kvkHome MacWin(0x01, VK_HOME)
#define kvkEnd MacWin(0x04, VK_END)
#define kvkPageUp MacWin(0x0B, VK_PRIOR)
#define kvkPageDown MacWin(0x0C, VK_NEXT)

#define kvkBack MacWin(0x08, VK_BACK)
#define kvkDelete MacWin(0x7F, VK_DELETE)
#define kvkReturn MacWin(0x0D, VK_RETURN)

#define kvkF1 VK_F1
#define kvkF2 VK_F2
#define kvkF3 VK_F3
#define kvkF4 VK_F4
#define kvkF5 VK_F5
#define kvkF6 VK_F6
#define kvkF7 VK_F7
#define kvkF8 VK_F8
#define kvkF9 VK_F9
#define kvkF10 VK_F10
#define kvkF11 VK_F11
#define kvkF12 VK_F12

#define VK_FROM_ALPHA(ch) (ch)

#endif

#endif //! KEYS_H
