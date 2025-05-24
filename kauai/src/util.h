/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Main include file for util files.

***************************************************************************/
#ifndef UTIL_H
#define UTIL_H
#include <stddef.h>
#include <cstdint>

// define the endian-ness
#ifdef IN_80386
#ifndef LITTLE_ENDIAN
#define LITTLE_ENDIAN
#endif // LITTLE_ENDIAN
#endif // IN_80386

#ifdef LITTLE_ENDIAN
#define BigLittle(a, b) b
#define Big(a)
#define Little(a) a
#else //! LITTLE_ENDIAN
#define BigLittle(a, b) a
#define Big(a) a
#define Little(a)
#endif //! LITTLE_ENDIAN

#ifdef MAC

#include "mac.h"

#elif defined(WIN)

#ifdef UNICODE
#ifndef _UNICODE
#define _UNICODE
#endif // _UNICODE
#endif // UNICODE

// windef.h typedef's PSZ to char *, this fools it into using PSZS instead
#define PSZ PSZS
#include <windows.h>
#include <windowsx.h>
#include <vfw.h>
#undef PSZ

#define MIR(foo) MAKEINTRESOURCE(foo)
typedef HBITMAP HBMP;
typedef HENHMETAFILE HPIC;
typedef HPALETTE HPAL;
typedef HCURSOR HCRS;
#define hBadWin INVALID_HANDLE_VALUE // some windows APIs return this

#endif // WIN

#ifdef KAUAI_SDL
#define SDL_MAIN_HANDLED 1
#include <SDL.h>
#include <SDL_syswm.h>
#include <SDL_ttf.h>
#endif // KAUAI_SDL

#define SIZEOF(foo) ((int32_t)sizeof(foo))
#define offset(FOO, field) ((ptrdiff_t) & ((FOO *)0)->field)
#define CvFromRgv(rgv) (SIZEOF(rgv) / SIZEOF(rgv[0]))
#define BLOCK

#ifdef DEBUG
#define priv
#else //! DEBUG
#define priv static
#endif //! DEBUG

// standard scalar types
const uint8_t kbMax = 0xFF;
const uint8_t kbMin = 0;

const int16_t kswMax = (int16_t)0x7FFF;
const int16_t kswMin = -kswMax; // so -kswMin is positive
const uint16_t ksuMax = 0xFFFF;
const uint16_t ksuMin = 0;

const int32_t klwMax = 0x7FFFFFFF;
const int32_t klwMin = -klwMax; // so -klwMin is positive
const uint32_t kluMax = 0xFFFFFFFF;
const uint32_t kluMin = 0;

// typedef int bool;

// standard character types:
// schar - short (skinny) character (1 byte)
// wchar - wide character (unicode)
// achar - application character
#ifdef MAC
typedef byte schar;
const schar kschMax = (schar)0xFF;
const schar kschMin = (schar)0;
#else  //! MAC
typedef char schar;
const schar kschMax = (schar)0x7F;
const schar kschMin = (schar)0x80;
#endif //! MAC

#ifdef WIN32
typedef wchar_t wchar;
#else  // !WIN32
typedef uint16_t wchar;
#endif // WIN32

const wchar kwchMax = ksuMax;
const wchar kwchMin = ksuMin;
#ifdef UNICODE
typedef wchar achar;
typedef unsigned short uchar;
const achar kchMax = kwchMax;
const achar kchMin = kwchMin;
#define PszLit(sz) L##sz
#define ChLit(ch) L##ch
#else //! UNICODE
typedef schar achar;
typedef unsigned char uchar;
const achar kchMax = kschMax;
const achar kchMin = kschMin;
#define PszLit(sz) sz
#define ChLit(ch) ch
#endif //! UNICODE

typedef class GRPB *PGRPB;
typedef class GLB *PGLB;
typedef class GL *PGL;
typedef class AL *PAL;
typedef class GGB *PGGB;
typedef class GG *PGG;
typedef class AG *PAG;
typedef class GSTB *PGSTB;
typedef class GST *PGST;
typedef class AST *PAST;
typedef class SCPT *PSCPT;
typedef class BLCK *PBLCK;

#include "framedef.h"
#include "debug.h"
#include "base.h"
#include "utilint.h"
#include "utilcopy.h"
#include "utilstr.h"
#include "utilmem.h"
#include "fni.h"
#include "file.h"
#include "groups.h"
#include "utilerro.h"
#include "chunk.h"
#include "utilrnd.h"
#include "crf.h"
#include "codec.h"

// optional
#include "stream.h"
#include "lex.h"
#include "scrcom.h"
#include "screxe.h"
#include "chse.h"
#include "midi.h"

#include "utilglob.h"

#endif //! UTIL_H
