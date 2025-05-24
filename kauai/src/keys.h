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

#endif

#endif //! KEYS_H
