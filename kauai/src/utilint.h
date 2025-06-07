/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Scalar, rectangle and point declarations

***************************************************************************/
#ifndef UTILINT_H
#define UTILINT_H

/****************************************
    Scalar constants
****************************************/
const bool fTrue = 1;
const bool fFalse = 0;
enum tribool
{
    tNo,
    tYes,
    tMaybe,
    tLim
};
#define AssertT(t) AssertIn(t, 0, tLim)

// standard comparison flags
enum
{
    fcmpEq = 0x0001,
    fcmpGt = 0x0002,
    fcmpLt = 0x0004,
};
const uint32_t kgrfcmpGe = (fcmpEq | fcmpGt);
const uint32_t kgrfcmpLe = (fcmpEq | fcmpLt);
const uint32_t kgrfcmpNe = (fcmpGt | fcmpLt);

#define FPure(f) ((f) != fFalse)
#define ivNil (-1L)
#define bvNil (-1L)
#define cvNil (-1L)
#define pvNil 0

/****************************************
    Memory access asserts
****************************************/
#ifdef DEBUG
void AssertPvCb(const void *pv, int32_t cb);
inline void AssertNilOrPvCb(const void *pv, int32_t cb)
{
    if (pv != pvNil)
        AssertPvCb(pv, cb);
}
#else //! DEBUG
#define AssertPvCb(pv, cb)
#define AssertNilOrPvCb(pv, cb)
#endif //! DEBUG

#define AssertThisMem() AssertPvCb(this, SIZEOF(*this))
#define AssertVarMem(pvar) AssertPvCb(pvar, SIZEOF(*(pvar)))
#define AssertNilOrVarMem(pvar) AssertNilOrPvCb(pvar, SIZEOF(*(pvar)))

/****************************************
    Scalar APIs
****************************************/
inline bool FIn(int32_t lw, int32_t lwMin, int32_t lwLim)
{
    return lw >= lwMin && lw < lwLim;
}
inline int32_t LwBound(int32_t lw, int32_t lwMin, int32_t lwMax)
{
    return lw < lwMin ? lwMin : lw >= lwMax ? lwMax - 1 : lw;
}
void SortLw(int32_t *plw1, int32_t *plw2);

inline int16_t SwHigh(int32_t lw)
{
    return (int16_t)(lw >> 16);
}
inline int16_t SwLow(int32_t lw)
{
    return (int16_t)lw;
}
inline int32_t LwHighLow(int16_t swHigh, int16_t swLow)
{
    return ((int32_t)swHigh << 16) | (int32_t)(uint16_t)swLow;
}
inline uint32_t LuHighLow(uint16_t suHigh, uint16_t suLow)
{
    return ((uint32_t)suHigh << 16) | (uint32_t)suLow;
}
inline uint8_t B0Lw(int32_t lw)
{
    return (uint8_t)lw;
}
inline uint8_t B1Lw(int32_t lw)
{
    return (uint8_t)(lw >> 8);
}
inline uint8_t B2Lw(int32_t lw)
{
    return (uint8_t)(lw >> 16);
}
inline uint8_t B3Lw(int32_t lw)
{
    return (uint8_t)(lw >> 24);
}
inline int32_t LwFromBytes(uint8_t b3, uint8_t b2, uint8_t b1, uint8_t b0)
{
    return ((int32_t)b3 << 24) | ((int32_t)b2 << 16) | ((int32_t)b1 << 8) | (int32_t)b0;
}

inline uint16_t SuHigh(int32_t lw)
{
    return (uint16_t)((uint32_t)lw >> 16);
}
inline uint16_t SuLow(int32_t lw)
{
    return (uint16_t)lw;
}

inline uint8_t BHigh(int16_t sw)
{
    return (uint8_t)((uint16_t)sw >> 8);
}
inline uint8_t BLow(int16_t sw)
{
    return (uint8_t)sw;
}
inline int16_t SwHighLow(uint8_t bHigh, uint8_t bLow)
{
    return ((int16_t)bHigh << 8) | (int16_t)bLow;
}
inline uint16_t SuHighLow(uint8_t bHigh, uint8_t bLow)
{
    return ((uint16_t)bHigh << 8) | (uint16_t)bLow;
}

inline int16_t SwTruncLw(int32_t lw)
{
    return lw <= kswMax ? (lw >= kswMin ? (int16_t)lw : kswMin) : kswMax;
}
inline int16_t SwMin(int16_t sw1, int16_t sw2)
{
    return sw1 < sw2 ? sw1 : sw2;
}
inline int16_t SwMax(int16_t sw1, int16_t sw2)
{
    return sw1 >= sw2 ? sw1 : sw2;
}
inline uint16_t SuMin(uint16_t su1, uint16_t su2)
{
    return su1 < su2 ? su1 : su2;
}
inline uint16_t SuMax(uint16_t su1, uint16_t su2)
{
    return su1 >= su2 ? su1 : su2;
}
inline int32_t LwMin(int32_t lw1, int32_t lw2)
{
    return lw1 < lw2 ? lw1 : lw2;
}
inline int32_t LwMax(int32_t lw1, int32_t lw2)
{
    return lw1 >= lw2 ? lw1 : lw2;
}
inline uint32_t LuMin(uint32_t lu1, uint32_t lu2)
{
    return lu1 < lu2 ? lu1 : lu2;
}
inline uint32_t LuMax(uint32_t lu1, uint32_t lu2)
{
    return lu1 >= lu2 ? lu1 : lu2;
}

inline int16_t SwAbs(int16_t sw)
{
    return sw < 0 ? -sw : sw;
}
inline int32_t LwAbs(int32_t lw)
{
    return lw < 0 ? -lw : lw;
}

inline int32_t LwMulSw(int16_t sw1, int16_t sw2)
{
    return (int32_t)sw1 * sw2;
}

#ifdef MC_68020

/***************************************************************************
    Motorola 68020 routines.
***************************************************************************/
extern "C"
{
    int32_t __cdecl LwMulDiv(int32_t lw, int32_t lwMul, int32_t lwDiv);
    void __cdecl MulLw(int32_t lw1, int32_t lw2, int32_t *plwHigh, uint32_t *pluLow);
    uint32_t __cdecl LuMulDiv(uint32_t lu, uint32_t luMul, uint32_t luDiv);
    void __cdecl MulLu(uint32_t lu1, uint32_t lu2, uint32_t *pluHigh, uint32_t *pluLow);
}
int32_t LwMulDivMod(int32_t lw, int32_t lwMul, int32_t lwDiv, int32_t *plwRem);

#elif defined(IN_80386)

/***************************************************************************
    Intel 80386 routines.
***************************************************************************/
inline int32_t LwMulDiv(int32_t lw, int32_t lwMul, int32_t lwDiv)
{
    AssertH(lwDiv != 0);
    __asm
    {
		mov		eax,lw
		imul	lwMul
		idiv	lwDiv
		mov		lw,eax
    }
    return lw;
}

inline int32_t LwMulDivMod(int32_t lw, int32_t lwMul, int32_t lwDiv, int32_t *plwRem)
{
    AssertH(lwDiv != 0);
    AssertVarMem(plwRem);
    __asm
    {
		mov		eax,lw
		imul	lwMul
		idiv	lwDiv
		mov		ecx,plwRem
		mov		DWORD PTR[ecx],edx
		mov		lw,eax
    }
    return lw;
}

void MulLw(int32_t lw1, int32_t lw2, int32_t *plwHigh, uint32_t *pluLow);
uint32_t LuMulDiv(uint32_t lu, uint32_t luMul, uint32_t luDiv);
void MulLu(uint32_t lu1, uint32_t lu2, uint32_t *pluHigh, uint32_t *pluLow);

#else //! MC_68020 && !IN_80386

/***************************************************************************
    Other processors.  These generally use floating point.
***************************************************************************/
int32_t LwMulDiv(int32_t lw, int32_t lwMul, int32_t lwDiv);
int32_t LwMulDivMod(int32_t lw, int32_t lwMul, int32_t lwDiv, int32_t *plwRem);
void MulLw(int32_t lw1, int32_t lw2, int32_t *plwHigh, uint32_t *pluLow);
uint32_t LuMulDiv(uint32_t lu, uint32_t luMul, uint32_t luDiv);
void MulLu(uint32_t lu1, uint32_t lu2, uint32_t *pluHigh, uint32_t *pluLow);

#endif //! MC_68020 && !IN_80386

int32_t LwMulDivAway(int32_t lw, int32_t lwMul, int32_t lwDiv);
uint32_t LuMulDivAway(uint32_t lu, uint32_t luMul, uint32_t luDiv);

uint32_t FcmpCompareFracs(int32_t lwNum1, int32_t lwDen1, int32_t lwNum2, int32_t lwDen2);

int32_t LwDivAway(int32_t lwNum, int32_t lwDen);
int32_t LwDivClosest(int32_t lwNum, int32_t lwDen);
int32_t LwRoundAway(int32_t lwSrc, int32_t lwBase);
int32_t LwRoundToward(int32_t lwSrc, int32_t lwBase);
int32_t LwRoundClosest(int32_t lwSrc, int32_t lwBase);

inline int32_t CbRoundToLong(int32_t cb)
{
    return (cb + SIZEOF(int32_t) - 1) & ~(int32_t)(SIZEOF(int32_t) - 1);
}
inline int32_t CbRoundToShort(int32_t cb)
{
    return (cb + SIZEOF(int16_t) - 1) & ~(int32_t)(SIZEOF(int16_t) - 1);
}
inline int32_t CbFromCbit(int32_t cbit)
{
    return (cbit + 7) / 8;
}
inline uint8_t Fbit(int32_t ibit)
{
    return 1 << (ibit & 0x0007);
}
inline int32_t IbFromIbit(int32_t ibit)
{
    return ibit >> 3;
}

int32_t LwGcd(int32_t lw1, int32_t lw2);
uint32_t LuGcd(uint32_t lu1, uint32_t lu2);

bool FAdjustIv(int32_t *piv, int32_t iv, int32_t cvIns, int32_t cvDel);

#ifdef DEBUG
void AssertIn(int32_t lw, int32_t lwMin, int32_t lwLim);
int32_t LwMul(int32_t lw1, int32_t lw2);
#else //! DEBUG
#define AssertIn(lw, lwMin, lwLim)
inline int32_t LwMul(int32_t lw1, int32_t lw2)
{
    return lw1 * lw2;
}
#endif //! DEBUG

/****************************************
    Byte Swapping
****************************************/

// byte order mask
typedef uint32_t BOM;

void SwapBytesBom(void *pv, BOM bom);
void SwapBytesRgsw(void *psw, int32_t csw);
void SwapBytesRglw(void *plw, int32_t clw);

const BOM bomNil = 0;
const BOM kbomSwapShort = 0x40000000;
const BOM kbomSwapLong = 0xC0000000;
const BOM kbomLeaveShort = 0x00000000;
const BOM kbomLeaveLong = 0x80000000;

/* You can chain up to 16 of these (2 bits each) */
#define BomField(bomNew, bomLast) ((bomNew) | ((bomLast) >> 2))

#ifdef DEBUG
void AssertBomRglw(BOM bom, int32_t cb);
void AssertBomRgsw(BOM bom, int32_t cb);
#else //! DEBUG
#define AssertBomRglw(bom, cb)
#define AssertBomRgsw(bom, cb)
#endif //! DEBUG

// FUTURE: remove redundant types
typedef class PT PTS;
typedef class RC RCS;

/****************************************
    Rectangle and point stuff
****************************************/
// options for PT::Transform and RC::Transform
enum
{
    fptNil,
    fptNegateXp = 1,  // negate xp values (and swap them in an RC)
    fptNegateYp = 2,  // negate yp values (and swap them in an RC)
    fptTranspose = 4, // swap xp and yp values (done after negating)
};

class RC;
typedef class RC *PRC;

class PT
{
  public:
    int32_t xp;
    int32_t yp;

  public:
    // constructors
    PT(void)
    {
    }
    PT(int32_t xpT, int32_t ypT)
    {
        xp = xpT, yp = ypT;
    }

#ifdef WIN32
    operator POINT(void);
    PT &operator=(POINT &pts);
    PT(POINT &pts)
    {
        *this = pts;
    }
#endif // WIN32

    // interaction with other points
    bool operator==(PT &pt)
    {
        return xp == pt.xp && yp == pt.yp;
    }
    bool operator!=(PT &pt)
    {
        return xp != pt.xp || yp != pt.yp;
    }
    PT operator+(PT &pt)
    {
        return PT(xp + pt.xp, yp + pt.yp);
    }
    PT operator-(PT &pt)
    {
        return PT(xp - pt.xp, yp - pt.yp);
    }
    PT &operator+=(PT &pt)
    {
        xp += pt.xp;
        yp += pt.yp;
        return *this;
    }
    PT &operator-=(PT &pt)
    {
        xp -= pt.xp;
        yp -= pt.yp;
        return *this;
    }
    void Offset(int32_t dxp, int32_t dyp)
    {
        xp += dxp;
        yp += dyp;
    }

    // map the point from prcSrc to prcDst coordinates
    void Map(RC *prcSrc, RC *prcDst);
    PT PtMap(RC *prcSrc, RC *prcDst);

    void Transform(uint32_t grfpt);
};

class RC
{
  public:
    int32_t xpLeft;
    int32_t ypTop;
    int32_t xpRight;
    int32_t ypBottom;

  public:
    // constructors
    RC(void)
    {
    }
    RC(int32_t xpLeftT, int32_t ypTopT, int32_t xpRightT, int32_t ypBottomT)
    {
        AssertThisMem();
        xpLeft = xpLeftT;
        ypTop = ypTopT;
        xpRight = xpRightT;
        ypBottom = ypBottomT;
    }

#ifdef WIN32
    operator RECT(void);
    RC &operator=(RECT &rcs);
    RC(RECT &rcs)
    {
        *this = rcs;
    }
#endif // WIN32

#ifdef KAUAI_SDL
    operator SDL_Rect(void);
    RC &operator=(SDL_Rect &rect);
    RC(SDL_Rect &rcs)
    {
        *this = rcs;
    }
#endif // KAUAI_SDL

    void Zero(void)
    {
        AssertThisMem();
        xpLeft = ypTop = xpRight = ypBottom = 0;
    }
    void Set(int32_t xp1, int32_t yp1, int32_t xp2, int32_t yp2)
    {
        AssertThisMem();
        xpLeft = xp1;
        ypTop = yp1;
        xpRight = xp2;
        ypBottom = yp2;
    }
    // use klwMin / 2 and klwMax / 2 so Dxp and Dyp are correct
    void Max(void)
    {
        AssertThisMem();
        xpLeft = ypTop = klwMin / 2;
        xpRight = ypBottom = klwMax / 2;
    }
    bool FMax(void)
    {
        AssertThisMem();
        return xpLeft == klwMin / 2 && ypTop == klwMin / 2 && xpRight == klwMax / 2 && ypBottom == klwMax / 2;
    }

    // interaction with other rc's and pt's
    bool operator==(RC &rc);
    bool operator!=(RC &rc);
    RC &operator+=(PT &pt)
    {
        xpLeft += pt.xp;
        ypTop += pt.yp;
        xpRight += pt.xp;
        ypBottom += pt.yp;
        return *this;
    }
    RC &operator-=(PT &pt)
    {
        xpLeft -= pt.xp;
        ypTop -= pt.yp;
        xpRight -= pt.xp;
        ypBottom -= pt.yp;
        return *this;
    }
    RC operator+(PT &pt)
    {
        return RC(xpLeft + pt.xp, ypTop + pt.yp, xpRight + pt.xp, ypBottom + pt.yp);
    }
    RC operator-(PT &pt)
    {
        return RC(xpLeft - pt.xp, ypTop - pt.yp, xpRight - pt.xp, ypBottom - pt.yp);
    }
    PT PtTopLeft(void)
    {
        return PT(xpLeft, ypTop);
    }
    PT PtBottomRight(void)
    {
        return PT(xpRight, ypBottom);
    }
    PT PtTopRight(void)
    {
        return PT(xpRight, ypTop);
    }
    PT PtBottomLeft(void)
    {
        return PT(xpLeft, ypBottom);
    }

    // map the rectangle from prcSrc to prcDst coordinates
    void Map(RC *prcSrc, RC *prcDst);

    void Transform(uint32_t grfpt);

    int32_t Dxp(void)
    {
        AssertThisMem();
        return xpRight - xpLeft;
    }
    int32_t Dyp(void)
    {
        AssertThisMem();
        return ypBottom - ypTop;
    }
    int32_t XpCenter(void)
    {
        AssertThisMem();
        return (xpLeft + xpRight) / 2;
    }
    int32_t YpCenter(void)
    {
        AssertThisMem();
        return (ypTop + ypBottom) / 2;
    }
    bool FEmpty(void)
    {
        AssertThisMem();
        return ypBottom <= ypTop || xpRight <= xpLeft;
    }

    void CenterOnRc(RC *prcBase);
    void CenterOnPt(int32_t xp, int32_t yp);
    bool FIntersect(RC *prc1, RC *prc2);
    bool FIntersect(RC *prc);
    bool FPtIn(int32_t xp, int32_t yp);
    void InsetCopy(RC *prc, int32_t dxp, int32_t dyp);
    void Inset(int32_t dxp, int32_t dyp);
    void OffsetCopy(RC *prc, int32_t dxp, int32_t dyp);
    void Offset(int32_t dxp, int32_t dyp);
    void OffsetToOrigin(void);
    void PinPt(PT *ppt);
    void PinToRc(RC *prc);
    void SqueezeIntoRc(RC *prcBase);
    void StretchToRc(RC *prcBase);
    void Union(RC *prc1, RC *prc2);
    void Union(RC *prc);
    int32_t LwArea(void);
    bool FContains(RC *prc);
    void SetToCell(RC *prcSrc, int32_t crcWidth, int32_t crcHeight, int32_t ircWidth, int32_t ircHeight);
    bool FMapToCell(int32_t xp, int32_t yp, int32_t crcWidth, int32_t crcHeight, int32_t *pircWidth,
                    int32_t *pircHeight);
};

/****************************************
    fractions (ratio/rational)
****************************************/
class RAT
{
    ASSERT

  private:
    int32_t _lwNum;
    int32_t _lwDen;

    // the third argument of this constructor is bogus.  This constructor is
    // provided so the GCD calculation can be skipped when we already know
    // the numerator and denominator are relatively prime.
    RAT(int32_t lwNum, int32_t lwDen, int32_t lwJunk)
    {
        // lwNum and lwDen are already relatively prime
        if (lwDen > 0)
        {
            _lwNum = lwNum;
            _lwDen = lwDen;
        }
        else
        {
            _lwNum = -lwNum;
            _lwDen = -lwDen;
        }
        AssertThis(0);
    }

  public:
    // constructors
    RAT(void)
    {
        _lwDen = 0;
    }
    RAT(int32_t lw)
    {
        _lwNum = lw;
        _lwDen = 1;
    }
    RAT(int32_t lwNum, int32_t lwDen)
    {
        Set(lwNum, lwDen);
    }
    void Set(int32_t lwNum, int32_t lwDen)
    {
        int32_t lwGcd = LwGcd(lwNum, lwDen);
        if (lwDen < 0)
            lwGcd = -lwGcd;
        _lwNum = lwNum / lwGcd;
        _lwDen = lwDen / lwGcd;
        AssertThis(0);
    }

    // unary minus
    RAT operator-(void) const
    {
        return RAT(-_lwNum, _lwDen, 0);
    }

    // access functions
    int32_t LwNumerator(void)
    {
        return _lwNum;
    }
    int32_t LwDenominator(void)
    {
        return _lwDen;
    }
    int32_t LwAway(void)
    {
        return LwDivAway(_lwNum, _lwDen);
    }
    int32_t LwToward(void)
    {
        return _lwNum / _lwDen;
    }
    int32_t LwClosest(void)
    {
        return LwDivClosest(_lwNum, _lwDen);
    }

    operator int32_t(void)
    {
        return _lwNum / _lwDen;
    }

    // applying to a long (as a multiplicative operator)
    int32_t LwScale(int32_t lw)
    {
        return (_lwNum != _lwDen) ? LwMulDiv(lw, _lwNum, _lwDen) : lw;
    }
    int32_t LwUnscale(int32_t lw)
    {
        return (_lwNum != _lwDen) ? LwMulDiv(lw, _lwDen, _lwNum) : lw;
    }

    // operator functions
    friend RAT operator+(const RAT &rat1, const RAT &rat2);
    friend RAT operator+(const RAT &rat, int32_t lw)
    {
        return RAT(rat._lwNum + LwMul(rat._lwDen, lw), rat._lwDen);
    }
    friend RAT operator+(int32_t lw, const RAT &rat)
    {
        return RAT(rat._lwNum + LwMul(rat._lwDen, lw), rat._lwDen);
    }

    friend RAT operator-(const RAT &rat1, const RAT &rat2)
    {
        return rat1 + (-rat2);
    }
    friend RAT operator-(const RAT &rat, int32_t lw)
    {
        return RAT(rat._lwNum + LwMul(rat._lwDen, -lw), rat._lwDen);
    }
    friend RAT operator-(int32_t lw, const RAT &rat)
    {
        return RAT(rat._lwNum + LwMul(rat._lwDen, -lw), rat._lwDen);
    }

    friend RAT operator*(const RAT &rat1, const RAT &rat2)
    {
        int32_t lwGcd1 = LwGcd(rat1._lwNum, rat2._lwDen);
        int32_t lwGcd2 = LwGcd(rat1._lwDen, rat2._lwNum);
        return RAT(LwMul(rat1._lwNum / lwGcd1, rat2._lwNum / lwGcd2), LwMul(rat1._lwDen / lwGcd2, rat2._lwDen / lwGcd1),
                   0);
    }
    friend RAT operator*(const RAT &rat, int32_t lw)
    {
        int32_t lwGcd = LwGcd(rat._lwDen, lw);
        return RAT(LwMul(lw / lwGcd, rat._lwNum), rat._lwDen / lwGcd, 0);
    }
    friend RAT operator*(int32_t lw, const RAT &rat)
    {
        int32_t lwGcd = LwGcd(rat._lwDen, lw);
        return RAT(LwMul(lw / lwGcd, rat._lwNum), rat._lwDen / lwGcd, 0);
    }

    friend RAT operator/(const RAT &rat1, const RAT &rat2)
    {
        int32_t lwGcd1 = LwGcd(rat1._lwNum, rat2._lwNum);
        int32_t lwGcd2 = LwGcd(rat1._lwDen, rat2._lwDen);
        return RAT(LwMul(rat1._lwNum / lwGcd1, rat2._lwDen / lwGcd2), LwMul(rat1._lwDen / lwGcd2, rat2._lwNum / lwGcd1),
                   0);
    }
    friend RAT operator/(const RAT &rat, int32_t lw)
    {
        int32_t lwGcd = LwGcd(rat._lwNum, lw);
        return RAT(rat._lwNum / lwGcd, LwMul(lw / lwGcd, rat._lwDen), 0);
    }
    friend RAT operator/(int32_t lw, const RAT &rat)
    {
        int32_t lwGcd = LwGcd(rat._lwNum, lw);
        return RAT(LwMul(lw / lwGcd, rat._lwDen), rat._lwNum / lwGcd, 0);
    }

    friend int operator==(const RAT &rat1, const RAT &rat2)
    {
        return rat1._lwNum == rat2._lwNum && rat1._lwDen == rat2._lwDen;
    }
    friend int operator==(const RAT &rat, int32_t lw)
    {
        return rat._lwDen == 1 && rat._lwNum == lw;
    }
    friend int operator==(int32_t lw, const RAT &rat)
    {
        return rat._lwDen == 1 && rat._lwNum == lw;
    }

    friend int operator!=(const RAT &rat1, const RAT &rat2)
    {
        return rat1._lwNum != rat2._lwNum || rat1._lwDen != rat2._lwDen;
    }
    friend int operator!=(const RAT &rat, int32_t lw)
    {
        return rat._lwDen != 1 || rat._lwNum != lw;
    }
    friend int operator!=(int32_t lw, const RAT &rat)
    {
        return rat._lwDen != 1 || rat._lwNum != lw;
    }

    // operator methods
    RAT &operator=(int32_t lw)
    {
        _lwNum = lw;
        _lwDen = 1;
        return *this;
    }

    RAT &operator+=(const RAT &rat)
    {
        *this = *this + rat;
        return *this;
    }
    RAT &operator+=(int32_t lw)
    {
        *this = *this + lw;
        return *this;
    }

    RAT &operator-=(const RAT &rat)
    {
        *this = *this - rat;
        return *this;
    }
    RAT &operator-=(int32_t lw)
    {
        *this = *this + (-lw);
        return *this;
    }

    RAT &operator*=(const RAT &rat)
    {
        *this = *this * rat;
        return *this;
    }
    RAT &operator*=(int32_t lw)
    {
        *this = *this * lw;
        return *this;
    }

    RAT &operator/=(const RAT &rat)
    {
        *this = *this / rat;
        return *this;
    }
    RAT &operator/=(int32_t lw)
    {
        *this = *this / lw;
        return *this;
    }
};

/***************************************************************************
    Data versioning utility
***************************************************************************/
struct DVER
{
    int16_t _swCur;
    int16_t _swBack;

    void Set(int16_t swCur, int16_t swBack);
    bool FReadable(int16_t swCur, int16_t swMin);
};

#endif // UTILINT_H
