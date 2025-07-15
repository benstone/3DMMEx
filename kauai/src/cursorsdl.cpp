/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    SDL Mouse cursor support

***************************************************************************/
#include "frame.h"
ASSERTNAME

RTCLASS(CURS)

/***************************************************************************
    Destructor for the cursor class.
***************************************************************************/
CURS::~CURS(void)
{
    SDL_FreeCursor(_crs);
    _crs = pvNil;
}

/***************************************************************************
    Read a cursor out of a CRF.
***************************************************************************/
bool CURS::FReadCurs(PCRF pcrf, CTG ctg, CNO cno, PBLCK pblck, PBACO *ppbaco, int32_t *pcb)
{
    PGG pggcurf;
    int32_t icurf, icurfBest;
    CURF curf;
    int16_t bo;
    int32_t dxp, dyp, dzpT;
    int32_t dzpBest;
    int32_t cbRowDst, cbRowSrc;
    uint8_t *prgb, *qrgb;
    PCURS pcurs = pvNil;

    const uint8_t *prgbAnd = pvNil;
    const uint8_t *prgbXor = pvNil;

    *pcb = SIZEOF(CURS);
    if (pvNil == ppbaco)
        return fTrue;

    if (pvNil == (pggcurf = GG::PggRead(pblck, &bo)) || pggcurf->IvMac() == 0)
    {
        ReleasePpo(&pggcurf);
        return fFalse;
    }

    // SDL cursor size is always 32 pixels
    dxp = dyp = 32;

    icurfBest = 0;
    dzpBest = klwMax;
    for (icurf = 0; icurf < pggcurf->IvMac(); icurf++)
    {
        pggcurf->GetFixed(icurf, &curf);
        if (kboOther == bo)
            SwapBytesBom(&curf, kbomCurf);
        if (curf.dxp > dxp || curf.dyp > dyp || curf.curt != curtMonochrome ||
            pggcurf->Cb(icurf) != (int32_t)curf.dxp * curf.dyp / 4)
        {
            continue;
        }

        dzpT = (dxp - curf.dxp) + (dyp - curf.dyp);
        if (dzpBest > dzpT)
        {
            icurfBest = icurf;
            if (dzpT == 0)
                break;
            dzpBest = dzpT;
        }
    }
    AssertIn(icurfBest, 0, pggcurf->IvMac());
    pggcurf->GetFixed(icurfBest, &curf);
    if (kboOther == bo)
        SwapBytesBom(&curf, kbomCurf);
    cbRowSrc = LwRoundAway(LwDivAway(curf.dxp, 8), 2);
    cbRowDst = LwRoundAway(LwDivAway(dxp, 8), 2);

    if (!FAllocPv((void **)&prgb, LwMul(cbRowDst, 2 * dyp), fmemClear, mprNormal))
        goto LFail;

    if (pvNil == (pcurs = NewObj CURS))
        goto LFail;

    qrgb = (uint8_t *)pggcurf->QvGet(icurfBest);

    // Convert the cursor to SDL's cursor format
    prgbAnd = qrgb;
    prgbXor = qrgb + LwMul(curf.dyp, cbRowSrc);

    for (dzpT = 0; dzpT < LwMin(dyp, curf.dyp); dzpT++)
    {
        uint8_t *prgbDstData = prgb + LwMul(dzpT, cbRowDst);
        uint8_t *prgbDstMask = prgb + LwMul(dyp + dzpT, cbRowDst);

        for (int32_t xp = 0; xp < LwDivAway(dxp, 8); xp++)
        {
            for (int32_t ibit = 0; ibit < 8; ibit++)
            {
                uint32_t mask = 0x80 >> ibit;
                uint8_t bAnd = *prgbAnd & mask;
                uint8_t bXor = *prgbXor & mask;

                if (!bAnd && !bXor)
                {
                    // Win32: both zero: black
                    // SDL: data=1, mask=1: black
                    *prgbDstData |= mask;
                    *prgbDstMask |= mask;
                }
                else if (!bAnd && bXor)
                {
                    // Win32: XOR only: white
                    // data=0, mask=1: white
                    *prgbDstData &= ~mask;
                    *prgbDstMask |= mask;
                }
                else if (bAnd && !bXor)
                {
                    // Win32: AND only: screen (transparent)
                    // SDL: data=0, mask=0: transparent
                    *prgbDstData &= ~mask;
                    *prgbDstMask &= ~mask;
                }
                else if (bAnd && bXor)
                {
                    // Win32: AND and XOR: Reverse screen
                    // data=1, mask=0: inverted color if possible, black if not.
                    *prgbDstData |= mask;
                    *prgbDstMask &= ~mask;
                }
            }
            prgbAnd++;
            prgbXor++;
            prgbDstData++;
            prgbDstMask++;
        }
    }

    pcurs->_crs = SDL_CreateCursor(prgb, prgb + LwMul(dxp, cbRowDst), dxp, dyp, curf.xp, curf.yp);
    if (pcurs->_crs == pvNil)
    {
        Bug(SDL_GetError());
        ReleasePpo(&pcurs);
        goto LFail;
    }

LFail:
    FreePpv((void **)&prgb);
    ReleasePpo(&pggcurf);

    *ppbaco = pcurs;
    return pvNil != pcurs;
}

/***************************************************************************
    Set the cursor.
***************************************************************************/
void CURS::Set(void)
{
    SDL_SetCursor(_crs);
}
