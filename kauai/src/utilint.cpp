/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Integer, rectangle and point utilities.
    WARNING: Must be in a fixed (pre-loaded) seg on Mac.

***************************************************************************/
#include "util.h"

#include <cmath>

ASSERTNAME

/***************************************************************************
    Calculates the GCD of two longs.
***************************************************************************/
int32_t LwGcd(int32_t lw1, int32_t lw2)
{
    return LuGcd(LwAbs(lw1), LwAbs(lw2));
}

/***************************************************************************
    Calculates the GCD of two unsigned longs.
***************************************************************************/
uint32_t LuGcd(uint32_t lu1, uint32_t lu2)
{
    // Euclidean algorithm - keep mod'ing until we hit zero
    if (lu1 == 0)
    {
        // if both are zero, return 1.
        return lu2 == 0 ? 1 : lu2;
    }

    for (;;)
    {
        lu2 %= lu1;
        if (lu2 == 0)
            return lu1 == 0 ? 1 : lu1;
        lu1 %= lu2;
        if (lu1 == 0)
            return lu2;
    }
}

/***************************************************************************
    Sort the two longs so the smaller is in *plw1.
***************************************************************************/
void SortLw(int32_t *plw1, int32_t *plw2)
{
    if (*plw1 > *plw2)
    {
        int32_t lwT = *plw1;
        *plw1 = *plw2;
        *plw2 = lwT;
    }
}

#ifndef MC_68020 // 68020 version in utilmc.asm
#ifndef IN_80386 // 80386 version inline in utilint.h
/***************************************************************************
    Multiply lw by lwMul and divide by lwDiv without losing precision.
***************************************************************************/
int32_t LwMulDiv(int32_t lw, int32_t lwMul, int32_t lwDiv)
{
    Assert(lwDiv != 0, "divide by zero error");
    double dou;

    dou = (double)lw * lwMul / lwDiv;
    Assert(dou <= klwMax && dou >= klwMin, "overflow in LwMulDiv");
    return (int32_t)dou;
}

/***************************************************************************
    Return the quotient and set *plwRem to the remainder when (lw * lwMul)
    is divided by lwDiv.
***************************************************************************/
int32_t LwMulDivMod(int32_t lw, int32_t lwMul, int32_t lwDiv, int32_t *plwRem)
{
    Assert(lwDiv != 0, "moding by 0");
    AssertVarMem(plwRem);
    double dou;

    dou = (double)lw * lwMul;
    *plwRem = static_cast<int32_t>(std::fmod(dou, lwDiv));
    dou /= lwDiv;
    Assert(dou <= klwMax && dou >= klwMin, "overflow in LwMulDiv");
    return (int32_t)dou;
}
#endif // IN_80386

/***************************************************************************
    Multiply two longs to get a 64 bit (signed) result.
***************************************************************************/
void MulLw(int32_t lw1, int32_t lw2, int32_t *plwHigh, uint32_t *pluLow)
{
#ifdef IN_80386
    __asm
    {
		mov		eax,lw1
		imul	lw2
		mov		ebx,plwHigh
		mov		[ebx],edx
		mov		ebx,pluLow
		mov		[ebx],eax
    }
#else  //! IN_80386
    double dou;
    bool fNeg;

    fNeg = 0 > (dou = (double)lw1 * lw2);
    if (fNeg)
        dou = -dou;
    *plwHigh = (int32_t)(dou / ((double)0x10000 * 0x10000));
    *pluLow = dou - *plwHigh * ((double)0x10000 * 0x10000);
    if (fNeg)
    {
        if (*pluLow == 0)
            *plwHigh = -*plwHigh;
        else
        {
            *pluLow = -*pluLow;
            *plwHigh = ~*plwHigh;
        }
    }
#endif //! IN_80386
}

/***************************************************************************
    Multiply lu by luMul and divide by luDiv without losing precision.
***************************************************************************/
uint32_t LuMulDiv(uint32_t lu, uint32_t luMul, uint32_t luDiv)
{
    Assert(luDiv != 0, "divide by zero error");

#ifdef IN_80386
    // REVIEW shonk: this will fault on overflow!
    __asm
    {
		mov		eax,lu
		mul		luMul
		div		luDiv
		mov		lu,eax
    }
    return lu;
#else  //! IN_80386
    double dou;

    dou = (double)lu * luMul / luDiv;
    Assert(dou <= kluMax && dou >= 0, "overflow in LuMulDiv");
    return (uint32_t)dou;
#endif //! IN_80386
}

/***************************************************************************
    Multiply two unsigned longs to get a 64 bit (unsigned) result.
***************************************************************************/
void MulLu(uint32_t lu1, uint32_t lu2, uint32_t *pluHigh, uint32_t *pluLow)
{
#ifdef IN_80386
    __asm
    {
		mov		eax,lu1
		mul		lu2
		mov		ebx,pluHigh
		mov		[ebx],edx
		mov		ebx,pluLow
		mov		[ebx],eax
    }
#else  //! IN_80386
    double dou;

    dou = (double)lu1 * lu2;
    *pluHigh = (uint32_t)(dou / ((double)0x10000 * 0x10000));
    *pluLow = dou - *pluHigh * ((double)0x10000 * 0x10000);
#endif //! IN_80386
}
#endif //! MC_68020

/***************************************************************************
    Does a multiply and divide without losing precision, rounding away from
    zero during the divide.
***************************************************************************/
int32_t LwMulDivAway(int32_t lw, int32_t lwMul, int32_t lwDiv)
{
    Assert(lwDiv != 0, "divide by zero error");
    int32_t lwT, lwRem;

    lwT = LwMulDivMod(lw, lwMul, lwDiv, &lwRem);
    if (lwRem != 0)
    {
        // divide wasn't exact
        if (lwT < 0)
            lwT--;
        else
            lwT++;
    }

    return lwT;
}

/***************************************************************************
    Does a multiply and divide without losing precision, rounding away from
    zero during the divide.
***************************************************************************/
uint32_t LuMulDivAway(uint32_t lu, uint32_t luMul, uint32_t luDiv)
{
    Assert(luDiv != 0, "divide by zero error");
    uint32_t luT;

    // get rid of common factors
    if (1 < (luT = LuGcd(lu, luDiv)))
    {
        lu /= luT;
        luDiv /= luT;
    }
    if (1 < (luT = LuGcd(luMul, luDiv)))
    {
        luMul /= luT;
        luDiv /= luT;
    }

    return LuMulDiv(lu, luMul, luDiv) + (luDiv > 1);
}

/***************************************************************************
    Returns lwNum divided by lwDen rounded away from zero.
***************************************************************************/
int32_t LwDivAway(int32_t lwNum, int32_t lwDen)
{
    Assert(lwDen != 0, "divide by zero");

    // make sure lwDen is greater than zero
    if (lwDen < 0)
    {
        lwDen = -lwDen;
        lwNum = -lwNum;
    }
    if (lwNum < 0)
        lwNum -= (lwDen - 1);
    else
        lwNum += (lwDen - 1);
    return lwNum / lwDen;
}

/***************************************************************************
    Returns lwNum divided by lwDen rounded toward the closest integer.
***************************************************************************/
int32_t LwDivClosest(int32_t lwNum, int32_t lwDen)
{
    Assert(lwDen != 0, "divide by zero");

    // make sure lwDen is greater than zero
    if (lwDen < 0)
    {
        lwDen = -lwDen;
        lwNum = -lwNum;
    }
    if (lwNum < 0)
        lwNum -= lwDen / 2;
    else
        lwNum += lwDen / 2;
    return lwNum / lwDen;
}

/***************************************************************************
    Rounds lwSrc to a multiple of lwBase.  The rounding is done away from
    zero.  Equivalent to LwDivAway(lwSrc, lwBase) * lwBase.
***************************************************************************/
int32_t LwRoundAway(int32_t lwSrc, int32_t lwBase)
{
    Assert(lwBase != 0, "divide by zero");

    // make sure lwBase is greater than zero
    if (lwBase < 0)
        lwBase = -lwBase;
    if (lwSrc < 0)
        lwSrc -= (lwBase - 1);
    else
        lwSrc += (lwBase - 1);
    return lwSrc - (lwSrc % lwBase);
}

/***************************************************************************
    Rounds lwSrc to a multiple of lwBase.  The rounding is done toward zero.
    Equivalent to (lwSrc / lwBase) * lwBase.
***************************************************************************/
int32_t LwRoundToward(int32_t lwSrc, int32_t lwBase)
{
    Assert(lwBase != 0, "divide by zero");

    // make sure lwBase is greater than zero
    if (lwBase < 0)
        lwBase = -lwBase;
    return lwSrc - (lwSrc % lwBase);
}

/***************************************************************************
    Rounds lwSrc to the closest multiple of lwBase.
    Equivalent to LwDivClosest(lwSrc, lwBase) * lwBase.
***************************************************************************/
int32_t LwRoundClosest(int32_t lwSrc, int32_t lwBase)
{
    Assert(lwBase != 0, "divide by zero");

    // make sure lwBase is greater than zero
    if (lwBase < 0)
        lwBase = -lwBase;
    if (lwSrc < 0)
        lwSrc -= lwBase / 2;
    else
        lwSrc += lwBase / 2;
    return lwSrc - (lwSrc % lwBase);
}

/***************************************************************************
    Returns fcmpGt, fcmpEq or fcmpLt according to whether (lwNum1 / lwDen2)
    is greater than, equal to or less than (lwNum2 / lwDen2).
***************************************************************************/
uint32_t FcmpCompareFracs(int32_t lwNum1, int32_t lwDen1, int32_t lwNum2, int32_t lwDen2)
{
    int32_t lwHigh1, lwHigh2; // must be signed
    uint32_t luLow1, luLow2;  // must be unsigned

    MulLw(lwNum1, lwDen2, &lwHigh1, &luLow1);
    MulLw(lwNum2, lwDen1, &lwHigh2, &luLow2);

    if (lwHigh1 > lwHigh2)
        return fcmpGt;
    if (lwHigh1 < lwHigh2)
        return fcmpLt;

    // the high 32 bits are the same, so just compare the low 32 bits
    // (as unsigned longs)
    Assert(lwHigh1 == lwHigh2, 0);
    if (luLow1 > luLow2)
        return fcmpGt;
    if (luLow1 < luLow2)
        return fcmpLt;
    return fcmpEq;
}

/***************************************************************************
    Adjusts an index after an edit.  *piv is the index to adjust, iv is
    the index where the edit occurred, cvIns is the number of things inserted
    and cvDel is the number deleted.  Returns true iff *piv is not in
    (iv, iv + cvDel).  If *piv is in this interval, mins *piv with iv + cvIns
    and returns false.
***************************************************************************/
bool FAdjustIv(int32_t *piv, int32_t iv, int32_t cvIns, int32_t cvDel)
{
    AssertVarMem(piv);
    AssertIn(iv, 0, kcbMax);
    AssertIn(cvIns, 0, kcbMax);
    AssertIn(cvDel, 0, kcbMax);

    if (*piv <= iv)
        return fTrue;
    if (*piv < iv + cvDel)
    {
        *piv = LwMin(*piv, iv + cvIns);
        return fFalse;
    }
    *piv += cvIns - cvDel;
    return fTrue;
}

#ifdef DEBUG
/***************************************************************************
    Multiplies two longs.  Asserts on overflow.
***************************************************************************/
int32_t LwMul(int32_t lw1, int32_t lw2)
{
    if (lw1 == 0)
        return 0;
    Assert((lw1 * lw2) / lw1 == lw2, "overflow");
    return lw1 * lw2;
}

/***************************************************************************
    Asserts that the lw is >= lwMin and < lwLim.
***************************************************************************/
void AssertIn(int32_t lw, int32_t lwMin, int32_t lwLim)
{
    Assert(lw >= lwMin, "long too small");
    Assert(lw < lwLim, "long too big");
}
#endif // DEBUG

/***************************************************************************
    Swap bytes in pv according to bom.  bom consists of up to 16
    2-bit opcodes (packed from hi bit to low bit).  The high bit of
    each opcode indicates a long field (1) or short field (0).  The low
    bit of each opcode indicates whether the bytes are to be swapped
    in the field (1) or left alone (0).
***************************************************************************/
void SwapBytesBom(void *pv, BOM bom)
{
    uint8_t b;
    uint8_t *pb = (uint8_t *)pv;

    Assert(SIZEOF(int32_t) == 4, "code broken");
    while (bom != 0)
    {
        if (bom & 0x80000000L)
        {
            // long field
            AssertPvCb(pb, 4);
            if (bom & 0x40000000L)
            {
                b = pb[3];
                pb[3] = pb[0];
                pb[0] = b;
                b = pb[2];
                pb[2] = pb[1];
                pb[1] = b;
            }
            pb += 4;
        }
        else
        {
            // short field
            AssertPvCb(pb, 2);
            if (bom & 0x40000000L)
            {
                b = pb[1];
                pb[1] = pb[0];
                pb[0] = b;
            }
            pb += 2;
        }
        bom <<= 2;
    }
}

/***************************************************************************
    Swap bytes within an array of short words.
***************************************************************************/
void SwapBytesRgsw(void *psw, int32_t csw)
{
    AssertIn(csw, 0, kcbMax);
    AssertPvCb(psw, LwMul(csw, SIZEOF(int16_t)));

    uint8_t b;
    uint8_t *pb = (uint8_t *)psw;

    for (; csw > 0; csw--, pb += 2)
    {
        b = pb[1];
        pb[1] = pb[0];
        pb[0] = b;
    }
}

/***************************************************************************
    Swap bytes within an array of long words.
***************************************************************************/
void SwapBytesRglw(void *plw, int32_t clw)
{
    AssertIn(clw, 0, kcbMax);
    AssertPvCb(plw, LwMul(clw, SIZEOF(int32_t)));

    uint8_t b;
    uint8_t *pb = (uint8_t *)plw;

    Assert(SIZEOF(int32_t) == 4, "code broken");
    for (; clw > 0; clw--, pb += 4)
    {
        b = pb[3];
        pb[3] = pb[0];
        pb[0] = b;
        b = pb[2];
        pb[2] = pb[1];
        pb[1] = b;
    }
}

#ifdef DEBUG
/***************************************************************************
    Asserts that the given BOM indicates a struct having cb/SIZEOF(int32_t) longs
    to be swapped (so SwapBytesRglw can legally be used on an array of
    these).
***************************************************************************/
void AssertBomRglw(BOM bom, int32_t cb)
{
    BOM bomT;
    int32_t clw;

    clw = cb / SIZEOF(int32_t);
    Assert(cb == clw * SIZEOF(int32_t), "cb is not a multiple of SIZEOF(int32_t)");
    AssertIn(clw, 1, 17);
    bomT = -1L << 2 * (16 - clw);
    Assert(bomT == bom, "wrong bom");
}

/***************************************************************************
    Asserts that the given BOM indicates a struct having cb/SIZEOF(int16_t) shorts
    to be swapped (so SwapBytesRgsw can legally be used on an array of
    these).
***************************************************************************/
void AssertBomRgsw(BOM bom, int32_t cb)
{
    BOM bomT;
    int32_t csw;

    csw = cb / SIZEOF(int16_t);
    Assert(cb == csw * SIZEOF(int16_t), "cb is not a multiple of SIZEOF(int16_t)");
    AssertIn(csw, 1, 17);
    bomT = 0x55555555 << 2 * (16 - csw);
    Assert(bomT == bom, "wrong bom");
}
#endif // DEBUG

#ifdef WIN32
/***************************************************************************
    Truncates a util point to a system point.
    REVIEW shonk: should we assert on truncation?  Should we truncate
    on windows?
***************************************************************************/
PT::operator POINT(void)
{
    AssertThisMem();
    POINT pts;

    pts.x = SwTruncLw(xp);
    pts.y = SwTruncLw(yp);

    return pts;
}

/***************************************************************************
    Copies a system point to a util point.
***************************************************************************/
PT &PT::operator=(POINT &pts)
{
    AssertThisMem();
    xp = pts.x;
    yp = pts.y;
    return *this;
}

#endif // WIN32

/***************************************************************************
    Map a point from prcSrc coordinates to prcDst coordinates.
***************************************************************************/
void PT::Map(RC *prcSrc, RC *prcDst)
{
    AssertThisMem();
    AssertVarMem(prcSrc);
    AssertVarMem(prcDst);
    int32_t dzpSrc, dzpDst;

    if ((dzpDst = prcDst->Dxp()) == (dzpSrc = prcSrc->Dxp()))
    {
        AssertVar(dzpSrc > 0, "empty map rectangle", prcSrc);
        xp += prcDst->xpLeft - prcSrc->xpLeft;
    }
    else
    {
        AssertVar(dzpSrc > 0, "empty map rectangle", prcSrc);
        xp = prcDst->xpLeft + LwMulDiv(xp - prcSrc->xpLeft, dzpDst, dzpSrc);
    }
    if ((dzpDst = prcDst->Dyp()) == (dzpSrc = prcSrc->Dyp()))
    {
        AssertVar(dzpSrc > 0, "empty map rectangle", prcSrc);
        yp += prcDst->ypTop - prcSrc->ypTop;
    }
    else
    {
        AssertVar(dzpSrc > 0, "empty map rectangle", prcSrc);
        yp = prcDst->ypTop + LwMulDiv(yp - prcSrc->ypTop, dzpDst, dzpSrc);
    }
}

/***************************************************************************
    Map a point from prcSrc coordinates to prcDst coordinates.
***************************************************************************/
PT PT::PtMap(RC *prcSrc, RC *prcDst)
{
    AssertThisMem();
    PT pt = *this;
    pt.Map(prcSrc, prcDst);
    return pt;
}

/***************************************************************************
    Transform the xp and yp values according to grfpt.  Negating comes
    before transposition.
***************************************************************************/
void PT::Transform(uint32_t grfpt)
{
    AssertThisMem();
    int32_t zp;

    if (grfpt & fptNegateXp)
        xp = -xp;
    if (grfpt & fptNegateYp)
        yp = -yp;
    if (grfpt & fptTranspose)
    {
        zp = xp;
        xp = yp;
        yp = zp;
    }
}

/***************************************************************************
    Check for equality, special casing empty.
***************************************************************************/
bool RC::operator==(RC &rc)
{
    AssertThisMem();

    if (FEmpty())
        return rc.FEmpty();

    return xpLeft == rc.xpLeft && ypTop == rc.ypTop && xpRight == rc.xpRight && ypBottom == rc.ypBottom;
}

/***************************************************************************
    Check for non-equality, special casing empty.
***************************************************************************/
bool RC::operator!=(RC &rc)
{
    AssertThisMem();

    if (FEmpty())
        return !rc.FEmpty();

    return xpLeft != rc.xpLeft || ypTop != rc.ypTop || xpRight != rc.xpRight || ypBottom != rc.ypBottom;
}

/***************************************************************************
    Unionize the rects.
***************************************************************************/
void RC::Union(RC *prc1, RC *prc2)
{
    AssertThisMem();
    AssertVarMem(prc1);
    AssertVarMem(prc2);

    *this = *prc1;
    Union(prc2);
}

/***************************************************************************
    Unionize the rects.
***************************************************************************/
void RC::Union(RC *prc)
{
    AssertThisMem();
    AssertVarMem(prc);

    // if a rect is empty, it shouldn't contribute to the union
    if (!prc->FEmpty())
    {
        if (FEmpty())
            *this = *prc;
        else
        {
            xpLeft = LwMin(xpLeft, prc->xpLeft);
            xpRight = LwMax(xpRight, prc->xpRight);
            ypTop = LwMin(ypTop, prc->ypTop);
            ypBottom = LwMax(ypBottom, prc->ypBottom);
        }
    }
}

/***************************************************************************
    Intersect the rects and return whether the result is non-empty.
***************************************************************************/
bool RC::FIntersect(RC *prc1, RC *prc2)
{
    AssertThisMem();
    AssertVarMem(prc1);
    AssertVarMem(prc2);

    xpLeft = LwMax(prc1->xpLeft, prc2->xpLeft);
    xpRight = LwMin(prc1->xpRight, prc2->xpRight);
    ypTop = LwMax(prc1->ypTop, prc2->ypTop);
    ypBottom = LwMin(prc1->ypBottom, prc2->ypBottom);

    if (FEmpty())
    {
        Zero();
        return fFalse;
    }
    return fTrue;
}

/***************************************************************************
    Intersect this rect with the given rect and return whether the result
    is non-empty.
***************************************************************************/
bool RC::FIntersect(RC *prc)
{
    AssertThisMem();
    AssertVarMem(prc);

    xpLeft = LwMax(xpLeft, prc->xpLeft);
    xpRight = LwMin(xpRight, prc->xpRight);
    ypTop = LwMax(ypTop, prc->ypTop);
    ypBottom = LwMin(ypBottom, prc->ypBottom);

    if (FEmpty())
    {
        Zero();
        return fFalse;
    }
    return fTrue;
}

/***************************************************************************
    Inset a rectangle (into another)
***************************************************************************/
void RC::InsetCopy(RC *prc, int32_t dxp, int32_t dyp)
{
    AssertThisMem();
    AssertVarMem(prc);

    xpLeft = prc->xpLeft + dxp;
    xpRight = prc->xpRight - dxp;
    ypTop = prc->ypTop + dyp;
    ypBottom = prc->ypBottom - dyp;
}

/***************************************************************************
    Inset a rectangle (in place)
***************************************************************************/
void RC::Inset(int32_t dxp, int32_t dyp)
{
    AssertThisMem();

    xpLeft += dxp;
    xpRight -= dxp;
    ypTop += dyp;
    ypBottom -= dyp;
}

/***************************************************************************
    Map this rectangle through the two rectangles (from prcSrc
    coordinates to prcDst coordinates).  This cannot be either prcSrc
    or prcDst.
***************************************************************************/
void RC::Map(RC *prcSrc, RC *prcDst)
{
    AssertThisMem();
    AssertVarMem(prcSrc);
    AssertVarMem(prcDst);
    int32_t dzpSrc, dzpDst;

    if ((dzpDst = prcDst->Dxp()) == (dzpSrc = prcSrc->Dxp()))
    {
        AssertVar(dzpSrc > 0, "empty map rectangle", prcSrc);
        xpLeft += prcDst->xpLeft - prcSrc->xpLeft;
        xpRight += prcDst->xpLeft - prcSrc->xpLeft;
    }
    else
    {
        AssertVar(dzpSrc > 0, "empty map rectangle", prcSrc);
        xpLeft = prcDst->xpLeft + LwMulDiv(xpLeft - prcSrc->xpLeft, dzpDst, dzpSrc);
        xpRight = prcDst->xpLeft + LwMulDiv(xpRight - prcSrc->xpLeft, dzpDst, dzpSrc);
    }
    if ((dzpDst = prcDst->Dyp()) == (dzpSrc = prcSrc->Dyp()))
    {
        AssertVar(dzpSrc > 0, "empty map rectangle", prcSrc);
        ypTop += prcDst->ypTop - prcSrc->ypTop;
        ypBottom += prcDst->ypTop - prcSrc->ypTop;
    }
    else
    {
        AssertVar(dzpSrc > 0, "empty map rectangle", prcSrc);
        ypTop = prcDst->ypTop + LwMulDiv(ypTop - prcSrc->ypTop, dzpDst, dzpSrc);
        ypBottom = prcDst->ypTop + LwMulDiv(ypBottom - prcSrc->ypTop, dzpDst, dzpSrc);
    }
}

/***************************************************************************
    Transform the xp and yp values according to grfpt.  Negating comes
    before transposition.
***************************************************************************/
void RC::Transform(uint32_t grfpt)
{
    AssertThisMem();
    int32_t zp;

    if (grfpt & fptNegateXp)
    {
        zp = xpLeft;
        xpLeft = -xpRight;
        xpRight = -zp;
    }
    if (grfpt & fptNegateYp)
    {
        zp = ypTop;
        ypTop = -ypBottom;
        ypBottom = -zp;
    }
    if (grfpt & fptTranspose)
    {
        zp = xpLeft;
        xpLeft = ypTop;
        ypTop = zp;
        zp = xpRight;
        xpRight = ypBottom;
        ypBottom = zp;
    }
}

/***************************************************************************
    Move a rectangle (into another)
***************************************************************************/
void RC::OffsetCopy(RC *prc, int32_t dxp, int32_t dyp)
{
    AssertThisMem();
    AssertVarMem(prc);

    xpLeft = prc->xpLeft + dxp;
    xpRight = prc->xpRight + dxp;
    ypTop = prc->ypTop + dyp;
    ypBottom = prc->ypBottom + dyp;
}

/***************************************************************************
    Move a rectangle (in place)
***************************************************************************/
void RC::Offset(int32_t dxp, int32_t dyp)
{
    AssertThisMem();

    xpLeft += dxp;
    xpRight += dxp;
    ypTop += dyp;
    ypBottom += dyp;
}

/***************************************************************************
    Move the rectangle so the top left is (0, 0).
***************************************************************************/
void RC::OffsetToOrigin(void)
{
    AssertThisMem();

    xpRight -= xpLeft;
    ypBottom -= ypTop;
    xpLeft = ypTop = 0;
}

/***************************************************************************
    Move this rectangle so it is centered over *prcBase.
***************************************************************************/
void RC::CenterOnRc(RC *prcBase)
{
    AssertThisMem();
    AssertVarMem(prcBase);
    int32_t dxp = Dxp();
    int32_t dyp = Dyp();

    xpLeft = (prcBase->xpLeft + prcBase->xpRight - dxp) / 2;
    xpRight = xpLeft + dxp;
    ypTop = (prcBase->ypTop + prcBase->ypBottom - dyp) / 2;
    ypBottom = ypTop + dyp;
}

/***************************************************************************
    Centers this rectangle on (xp, yp).
***************************************************************************/
void RC::CenterOnPt(int32_t xp, int32_t yp)
{
    AssertThisMem();
    int32_t dxp = Dxp();
    int32_t dyp = Dyp();

    xpLeft = xp - dxp / 2;
    xpRight = xpLeft + dxp;
    ypTop = yp - dyp / 2;
    ypBottom = ypTop + dyp;
}

/***************************************************************************
    Center this rectangle over *prcBase.  If it doesn't fit inside *prcBase,
    scale it down so it does.
***************************************************************************/
void RC::SqueezeIntoRc(RC *prcBase)
{
    AssertThisMem();
    AssertVarMem(prcBase);

    if (Dxp() <= prcBase->Dxp() && Dyp() <= prcBase->Dyp())
        CenterOnRc(prcBase);
    else
        StretchToRc(prcBase);
}

/***************************************************************************
    Scale this rectangle proportionally (and translate it) so it is centered
    on *prcBase and as large as possible but still inside *prcBase.
***************************************************************************/
void RC::StretchToRc(RC *prcBase)
{
    AssertThisMem();
    AssertVarMem(prcBase);
    int32_t dxp = Dxp();
    int32_t dyp = Dyp();
    int32_t dxpBase = prcBase->Dxp();
    int32_t dypBase = prcBase->Dyp();

    if (dxp <= 0 || dyp <= 0)
    {
        Bug("empty rc to stretch");
        Zero();
        return;
    }

    if (FcmpCompareFracs(dxp, dyp, dxpBase, dypBase) & fcmpLt)
    {
        // height dominated
        dxp = LwMulDiv(dxp, dypBase, dyp);
        dyp = dypBase;
    }
    else
    {
        // width dominated
        dyp = LwMulDiv(dyp, dxpBase, dxp);
        dxp = dxpBase;
    }
    xpRight = xpLeft + dxp;
    ypBottom = ypTop + dyp;
    CenterOnRc(prcBase);
}

/***************************************************************************
    Determine if the given point is in the rectangle
***************************************************************************/
bool RC::FPtIn(int32_t xp, int32_t yp)
{
    AssertThisMem();

    return xp >= xpLeft && xp < xpRight && yp >= ypTop && yp < ypBottom;
}

/***************************************************************************
    Pin the point to the rectangle.
***************************************************************************/
void RC::PinPt(PT *ppt)
{
    AssertThisMem();
    AssertVarMem(ppt);

    ppt->xp = LwBound(ppt->xp, xpLeft, xpRight);
    ppt->yp = LwBound(ppt->yp, ypTop, ypBottom);
}

/***************************************************************************
    Pin this rectangle to the given one.
***************************************************************************/
void RC::PinToRc(RC *prc)
{
    AssertThisMem();
    AssertVarMem(prc);
    int32_t dxp, dyp;

    dxp = LwMax(LwMin(0, prc->xpRight - xpRight), prc->xpLeft - xpLeft);
    dyp = LwMax(LwMin(0, prc->ypBottom - ypBottom), prc->ypTop - ypTop);
    if (dxp != 0 || dyp != 0)
        Offset(dxp, dyp);
}

#ifdef WIN32

/***************************************************************************
    Copies a system rectangle to a util rectangle.
***************************************************************************/
RC &RC::operator=(RECT &rcs)
{
    AssertThisMem();

    xpLeft = (int32_t)rcs.left;
    xpRight = (int32_t)rcs.right;
    ypTop = (int32_t)rcs.top;
    ypBottom = (int32_t)rcs.bottom;
    return *this;
}

/***************************************************************************
    Truncates util rectangle to a system rectangle.
    REVIEW shonk: should we assert on truncation?
***************************************************************************/
RC::operator RECT(void)
{
    AssertThisMem();
    RECT rcs;

    rcs.left = SwTruncLw(xpLeft);
    rcs.right = SwTruncLw(xpRight);
    rcs.top = SwTruncLw(ypTop);
    rcs.bottom = SwTruncLw(ypBottom);
    return rcs;
}

#endif // WIN32

/***************************************************************************
    Return the area of the rectangle.
***************************************************************************/
int32_t RC::LwArea(void)
{
    AssertThisMem();

    if (FEmpty())
        return 0;
    return LwMul(xpRight - xpLeft, ypBottom - ypTop);
}

/***************************************************************************
    Return whether this rectangle fully contains *prc.
***************************************************************************/
bool RC::FContains(RC *prc)
{
    AssertThisMem();
    AssertVarMem(prc);

    return prc->FEmpty() ||
           prc->xpLeft >= xpLeft && prc->xpRight <= xpRight && prc->ypTop >= ypTop && prc->ypBottom <= ypBottom;
}

/***************************************************************************
    Imagine *prcSrc divided into a crcWidth by crcHeight grid.  This sets
    this rc to the (ircWidth, ircHeight) cell of the grid.  prcSrc cannot
    be equal to this.
***************************************************************************/
void RC::SetToCell(RC *prcSrc, int32_t crcWidth, int32_t crcHeight, int32_t ircWidth, int32_t ircHeight)
{
    AssertThisMem();
    AssertVarMem(prcSrc);
    AssertIn(crcWidth, 1, kcbMax);
    AssertIn(crcHeight, 1, kcbMax);
    AssertIn(ircWidth, 0, crcWidth);
    AssertIn(ircHeight, 0, crcHeight);
    Assert(this != prcSrc, "this can't be prcSrc");

    xpLeft = prcSrc->xpLeft + LwMulDiv(prcSrc->Dxp(), ircWidth, crcWidth);
    xpRight = prcSrc->xpLeft + LwMulDiv(prcSrc->Dxp(), ircWidth + 1, crcWidth);
    ypTop = prcSrc->ypTop + LwMulDiv(prcSrc->Dyp(), ircHeight, crcHeight);
    ypBottom = prcSrc->ypTop + LwMulDiv(prcSrc->Dyp(), ircHeight + 1, crcHeight);
}

/***************************************************************************
    Determines which cell the given (xp, yp) is in.  This is essentially
    the inverse of SetToCell.
***************************************************************************/
bool RC::FMapToCell(int32_t xp, int32_t yp, int32_t crcWidth, int32_t crcHeight, int32_t *pircWidth,
                    int32_t *pircHeight)
{
    AssertThisMem();
    AssertIn(crcWidth, 1, kcbMax);
    AssertIn(crcHeight, 1, kcbMax);
    AssertVarMem(pircWidth);
    AssertVarMem(pircHeight);

    if (!FPtIn(xp, yp))
        return fFalse;
    *pircWidth = LwMulDiv(xp - xpLeft, crcWidth, Dxp());
    *pircHeight = LwMulDiv(yp - ypTop, crcHeight, Dyp());
    return fTrue;
}

#ifdef DEBUG
/***************************************************************************
    Asserts the validity of a fraction.
***************************************************************************/
void RAT::AssertValid(uint32_t grf)
{
    AssertIn(_lwDen, 1, klwMax);
    int32_t lwGcd = LwGcd(_lwNum, _lwDen);
    Assert(lwGcd == 1, "fraction not in lowest terms");
}
#endif // DEBUG

/***************************************************************************
    Constructor for the master clock.
***************************************************************************/
USAC::USAC(void)
{
    AssertThisMem();
    _tsBaseSys = TsCurrentSystem();
    _tsBaseApp = 0;
    _luScale = kluTimeScaleNormal;
}

/***************************************************************************
    Return the current application time.
***************************************************************************/
uint32_t USAC::TsCur(void)
{
    AssertThisMem();
    uint32_t dtsSys = TsCurrentSystem() - _tsBaseSys;

    if (_luScale != kluTimeScaleNormal)
    {
        uint32_t luHigh;
        MulLu(dtsSys, _luScale, &luHigh, &dtsSys);
        dtsSys = LwHighLow(SuLow(luHigh), SuHigh(dtsSys));
    }

    return _tsBaseApp + dtsSys;
}

/***************************************************************************
    Scale the time.
***************************************************************************/
void USAC::Scale(uint32_t luScale)
{
    AssertThisMem();
    uint32_t tsSys, dts;

    if (luScale == _luScale)
        return;

    // set the _tsBaseSys and _tsBaseApp to now and set _luScale to luScale.
    tsSys = TsCurrentSystem();
    dts = tsSys - _tsBaseSys;
    if (_luScale != kluTimeScaleNormal)
    {
        uint32_t luHigh;
        MulLu(dts, _luScale, &luHigh, &dts);
        dts = LwHighLow(SuLow(luHigh), SuHigh(dts));
    }
    _tsBaseApp += dts;
    _tsBaseSys = tsSys;
    _luScale = luScale;
}

/***************************************************************************
    Set the DVER structure.
***************************************************************************/
void DVER::Set(int16_t swCur, int16_t swBack)
{
    _swBack = swBack;
    _swCur = swCur;
}

/***************************************************************************
    Determines if the DVER structure is compatible with (swCur and swMin).
    Asserts that 0 <= swMin <= swCur.
***************************************************************************/
bool DVER::FReadable(int16_t swCur, int16_t swMin)
{
    AssertIn(_swBack, 0, _swCur + 1);
    AssertIn(_swCur, 0, kswMax);
    AssertIn(swMin, 0, swCur + 1);
    AssertIn(swCur, 0, kswMax);
    return _swCur >= swMin && _swBack <= swCur;
}
