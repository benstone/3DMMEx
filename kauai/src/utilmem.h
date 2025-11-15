/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Memory handling

***************************************************************************/
#ifndef UTILMEM_H
#define UTILMEM_H

// used for asserts and limiting memory
const uint8_t kbGarbage = 0xA3;    // new blocks are filled with this
const int32_t kcbMax = 0x08000000; // 128 Megabytes
const int16_t kswMagicMem = (int16_t)0xA253;
const int32_t klwMagicMem = (int32_t)0xA253A253;

/***************************************************************************
    When an allocation fails, vpfnlib is called to free some memory (if it's
    not nil).
***************************************************************************/
typedef int32_t (*PFNLIB)(int32_t cb, int32_t mpr);
extern PFNLIB vpfnlib;
extern bool _fInAlloc;

/****************************************
    OS memory handles and management
****************************************/
#ifdef MAC
typedef Handle HN;
// version of SetHandleSize that returns an error code
inline int16_t ErrSetHandleSize(HN hn, Size cb)
{
    SetHandleSize(hn, cb);
    return MemError();
}

// address stipper
class ADST
{
  private:
    int32_t _lwMaskAddress;

  public:
    ADST(void);

    void *PvStrip(void *pv)
    {
        return (void *)((int32_t)pv & _lwMaskAddress);
    }
};
extern ADST vadst;

#elif defined(WIN)
typedef HGLOBAL HN;
#endif

/****************************************
    Moveable/resizeable memory management
****************************************/
typedef void *HQ;
#define hNil 0
#define hqNil ((HQ)0)

// memory request priority
enum
{
    // lower priority
    mprDebug,
    mprForSpeed,
    mprNormal,
    mprCritical,
    // higher priority
};

// memory allocation options
enum
{
    fmemNil = 0,
    fmemClear = 1,
};

void FreePhq(HQ *phq);
int32_t CbOfHq(HQ hq);
bool FCopyHq(HQ hqSrc, HQ *phqDst, int32_t mpr);
bool FResizePhq(HQ *phq, int32_t cb, uint32_t grfmem, int32_t mpr);
void *PvLockHq(HQ hq);
void UnlockHq(HQ hq);

#ifdef DEBUG

// debug memory allocator globals
// enter vmutxMem before modifying these...
struct DMAGL
{
    int32_t cv;    // number of allocations
    int32_t cvTot; // total number of allocations over all time
    int32_t cvRun; // running max of cv
    int32_t cb;    // total size of allocations
    int32_t cbRun; // running max of cb

    int32_t cactDo;   // number of times to succeed before failing
    int32_t cactFail; // number of times to fail

    bool FFail(void);
    void Allocate(int32_t cbT);
    void Resize(int32_t dcb);
    void Free(int32_t cbT);
};

// debug memory globals
struct DMGLOB
{
    DMAGL dmaglBase; // for NewObj
    DMAGL dmaglHq;   // for HQs
    DMAGL dmaglPv;   // for FAllocPv, etc
};
extern DMGLOB vdmglob;

extern int32_t vcactSuspendCheckPointers;
#define SuspendCheckPointers() vcactSuspendCheckPointers++;
#define ResumeCheckPointers() vcactSuspendCheckPointers--;

bool FAllocHqDebug(HQ *phq, int32_t cb, uint32_t grfmem, int32_t mpr, schar *pszsFile, int32_t lwLine);
#define FAllocHq(phq, cb, grfmem, mpr) FAllocHqDebug(phq, cb, grfmem, mpr, __szsFile, __LINE__)
void *QvFromHq(HQ hq);

void AssertHq(HQ hq);
void MarkHq(HQ hq);
#ifdef MAC
void _AssertUnmarkedHqs(void);
void _UnmarkAllHqs(void);
#endif // MAC

#else //! DEBUG

#define FAllocHqDebug(phq, cb, grfmem, mpr, pszsFile, luLine) FAllocHq(phq, cb, grfmem, mpr)
bool FAllocHq(HQ *phq, int32_t cb, uint32_t grfmem, int32_t mpr);
#ifdef MAC
inline void *QvFromHq(HQ hq)
{
    return vadst.PvStrip(*(void **)hq);
}
#elif defined(WIN)
inline void *QvFromHq(HQ hq)
{
    return (void *)hq;
}
#endif // WIN

#define AssertHq(hq)
#define MarkHq(hq)

#endif //! DEBUG

/****************************************
    Fixed (non-moveable) memory.
****************************************/
#ifdef DEBUG

// allocation routine
bool FAllocPvDebug(void **ppv, int32_t cb, uint32_t grfmem, int32_t mpr, schar *pszsFile, int32_t lwLine,
                   DMAGL *pdmagl);
#define FAllocPv(ppv, cb, grfmem, mpr) FAllocPvDebug(ppv, cb, grfmem, mpr, __szsFile, __LINE__, &vdmglob.dmaglPv)

// resizing routine - WIN only
#ifdef WIN
bool _FResizePpvDebug(void **ppv, int32_t cbNew, int32_t cbOld, uint32_t grfmem, int32_t mpr, DMAGL *pdmagl);
#endif // WIN

// freeing routine
void FreePpvDebug(void **ppv, DMAGL *pdmagl);
#define FreePpv(ppv) FreePpvDebug(ppv, &vdmglob.dmaglPv)

void AssertPvAlloced(void *pv, int32_t cb);
void AssertUnmarkedMem(void);
void UnmarkAllMem(void);
void MarkPv(void *pv);

#else //! DEBUG

#define SuspendCheckPointers()
#define ResumeCheckPointers()

// allocation routine
#define FAllocPvDebug(ppv, cb, grfmem, mpr, pszsFile, luLine, pdmagl) FAllocPv(ppv, cb, grfmem, mpr)
bool FAllocPv(void **ppv, int32_t cb, uint32_t grfmem, int32_t mpr);

// resizing routine - WIN only
#ifdef WIN
#define _FResizePpvDebug(ppv, cbNew, cbOld, grfmem, mpr, pdmagl) _FResizePpv(ppv, cbNew, cbOld, grfmem, mpr)
bool _FResizePpv(void **ppv, int32_t cbNew, int32_t cbOld, uint32_t grfmem, int32_t mpr);
#endif // WIN

// freeing routine
#define FreePpvDebug(ppv, pdmagl) FreePpv(ppv)
void FreePpv(void **ppv);

#define AssertPvAlloced(pv, cb)
#define AssertUnmarkedMem()
#define UnmarkAllMem()
#define MarkPv(pv)
#endif //! DEBUG

/****************************************
    Memory trashing
****************************************/
#ifdef DEBUG

#define TrashVar(pfoo)                                                                                                 \
    if (pvNil != (pfoo))                                                                                               \
        FillPb(pfoo, SIZEOF(*(pfoo)), kbGarbage);                                                                      \
    else                                                                                                               \
        (void)0
#define TrashVarIf(f, pfoo)                                                                                            \
    if ((f) && pvNil != (pfoo))                                                                                        \
        FillPb(pfoo, SIZEOF(*(pfoo)), kbGarbage);                                                                      \
    else                                                                                                               \
        (void)0
#define TrashPvCb(pv, cb)                                                                                              \
    if (pvNil != (pv))                                                                                                 \
        FillPb(pv, cb, kbGarbage);                                                                                     \
    else                                                                                                               \
        (void)0
#define TrashPvCbIf(f, pv, cb)                                                                                         \
    if ((f) && pvNil != (pv))                                                                                          \
        FillPb(pv, cb, kbGarbage);                                                                                     \
    else                                                                                                               \
        (void)0

#else //! DEBUG

#define TrashVar(pfoo)
#define TrashVarIf(f, pfoo)
#define TrashPvCb(pv, cb)
#define TrashPvCbIf(f, pv, cb)

#endif //! DEBUG

/****************************************
    Pointer arithmetic
****************************************/
inline void *PvAddBv(void *pv, int32_t bv)
{
    return (uint8_t *)pv + bv;
}
inline void *PvSubBv(void *pv, int32_t bv)
{
    return (uint8_t *)pv - bv;
}
inline int32_t BvSubPvs(void *pv1, void *pv2)
{
    return (uint8_t *)pv1 - (uint8_t *)pv2;
}

#include "platform.h"

extern MUTX vmutxMem;

/****************************************
    Current thread id
****************************************/
inline int32_t LwThreadCur(void)
{
    return MacWin(0, GetCurrentThreadId());
}

#endif //! UTILMEM_H
