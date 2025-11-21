/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    String manipulation declarations.

    We use four types of strings: stn, stz, st, sz.  Unless there's good reason
    not to, all code should use stn's.

    sz - zero terminated (standard C) string.
    csz - constant zero terminated (standard C) string.
    st - length byte prefixed (standard Pascal) string.
    stz - zero terminated and length prefixed string.
    stn - string class.

***************************************************************************/
#ifndef UTILSTR_H
#define UTILSTR_H

#include <cstdarg>

/***************************************************************************
    OS kind for string translation - these should always have their high
    and low bytes equal.
***************************************************************************/
const int16_t oskNil = 0; // signifies unknown
const int16_t koskSbMac = 0x0202;
const int16_t koskSbWin = 0x0303;
const int16_t koskUniMac = 0x0404; // big endian unicode
const int16_t koskUniWin = 0x0505; // little endian unicode

#ifdef UNICODE
const int16_t koskMac = koskUniMac;
const int16_t koskWin = koskUniWin;
#else  //! UNICODE
const int16_t koskMac = koskSbMac;
const int16_t koskWin = koskSbWin;
#endif //! UNICODE

#ifdef MAC
const int16_t koskCur = koskMac;
const int16_t koskSb = koskSbMac;
const int16_t koskUni = koskUniMac;
#else
const int16_t koskCur = koskWin;
const int16_t koskSb = koskSbWin;
const int16_t koskUni = koskUniWin;
#endif

#ifdef DEBUG
void AssertOsk(int16_t osk);
#else //! DEBUG
#define AssertOsk(osk)
#endif //! DEBUG

/***************************************************************************
    Return the number of bytes a character occupies in the given osk.
***************************************************************************/
inline int32_t CbCharOsk(int16_t osk)
{
    switch (osk)
    {
    case koskSbMac:
    case koskSbWin:
        return SIZEOF(schar);

    case koskUniMac:
    case koskUniWin:
        return SIZEOF(wchar);

    default:
        return 0;
    }
}

/***************************************************************************
    Constants
***************************************************************************/
const achar chNil = ChLit('\x0');
const achar kchReturn = ChLit('\xD');
const achar kchLineFeed = ChLit('\xA');
const achar kchTab = ChLit('\x9');
const achar kchSpace = ChLit(' ');
const wchar kchwUnicode = 0xFEFF;
const wchar kchwUnicodeSwap = 0xFFFE;

const int32_t kcchMaxSz = 255;
const int32_t kcchMaxUtf8Sz = 511;
const int32_t kcchMaxSt = 255;
const int32_t kcchMaxStz = 255;
const int32_t kcchExtraSz = 1;
const int32_t kcchExtraSt = 1;
const int32_t kcchExtraStz = 2;
const int32_t kcchTotSz = kcchMaxSz + kcchExtraSz;
const int32_t kcchTotSt = kcchMaxSt + kcchExtraSt;
const int32_t kcchTotStz = kcchMaxStz + kcchExtraStz;
const int32_t kcchTotUtf8Sz = kcchMaxUtf8Sz + kcchExtraSz;

const int32_t kcchMaxStn = 255;
const int32_t kcbMaxDataStn = kcchTotStz * SIZEOF(wchar) + SIZEOF(int16_t);

enum
{
    fstnNil = 0,
    fstnIgnoreCase,
};

/***************************************************************************
    String types
***************************************************************************/
typedef achar *PSZ;
typedef const achar *PCSZ;
typedef achar *PST;
typedef achar *PSTZ;
typedef achar SZ[kcchTotSz];
typedef achar ST[kcchTotSt];
typedef achar STZ[kcchTotStz];
typedef schar *PSZS;
typedef schar SZS[kcchTotSz];

typedef char *PU8SZ;
typedef char U8SZ[kcchTotUtf8Sz];

/***************************************************************************
    String related asserts
***************************************************************************/
#ifdef DEBUG
void AssertRgch(achar *prgch, int32_t cch);
void AssertStz(PSTZ pstz);
void AssertSt(PST pst);
void AssertSz(PCSZ psz);
void AssertNilOrSz(PSZ psz);
#else
#define AssertRgch(prgch, cch)
#define AssertStz(pstz)
#define AssertSt(pst)
#define AssertSz(psz)
#define AssertNilOrSz(psz)
#endif

/***************************************************************************
    Testing validity of an stz or st
***************************************************************************/
bool FValidStz(PSTZ pstz);
bool FValidSt(PST pst);

/***************************************************************************
    Cch means the number of characters (not including prefix and termination
    bytes) and CchTot means the total number of characters including
    overhead.
***************************************************************************/
int32_t CchSz(const PCSZ psz);
inline int32_t CchTotSz(const PSZ psz)
{
    return CchSz(psz) + kcchExtraSz;
}
inline int32_t CchSt(PST pst)
{
    AssertSt(pst);
    return (int32_t)(uint8_t)pst[0];
}
inline int32_t CchTotSt(PST pst)
{
    AssertSt(pst);
    return (int32_t)(uint8_t)pst[0] + kcchExtraSt;
}
inline int32_t CchStz(PSTZ pstz)
{
    AssertStz(pstz);
    return (int32_t)(uint8_t)pstz[0];
}
inline int32_t CchTotStz(PSTZ pstz)
{
    AssertStz(pstz);
    return (int32_t)(uint8_t)pstz[0] + kcchExtraStz;
}

inline achar *PrgchSt(PST pst)
{
    return pst + 1;
}
inline PSZ PszStz(PSTZ pstz)
{
    return pstz + 1;
}

/***************************************************************************
    Byte-wise comparison and sorting.
    WARNING: these don't do normal UI level compares they do byte-wise
    comparison, including any length and/or terminating bytes and should
    be used only for internal sorting (for binary search etc).
***************************************************************************/
bool FEqualRgch(const achar *prgch1, int32_t cch1, const achar *prgch2, int32_t cch2);
uint32_t FcmpCompareRgch(const achar *prgch1, int32_t cch1, const achar *prgch2, int32_t cch2);

/***************************************************************************
    User level (case insensitive, locale aware) comparison and sorting.
***************************************************************************/
bool FEqualUserRgch(const achar *prgch1, int32_t cch1, const achar *prgch2, int32_t cch2,
                    uint32_t grfstn = fstnIgnoreCase);
uint32_t FcmpCompareUserRgch(const achar *prgch1, int32_t cch1, const achar *prgch2, int32_t cch2,
                             uint32_t grfstn = fstnIgnoreCase);

/***************************************************************************
    Upper and lower case utilies
***************************************************************************/
void UpperRgchs(schar *prgchs, int32_t cchs);
void LowerRgchs(schar *prgchs, int32_t cchs);
inline schar ChsUpper(schar chs)
{
    UpperRgchs(&chs, 1);
    return chs;
}
inline schar ChsLower(schar chs)
{
    LowerRgchs(&chs, 1);
    return chs;
}
void UpperRgchw(wchar *prgchw, int32_t cchw);
void LowerRgchw(wchar *prgchw, int32_t cchw);
inline wchar ChwUpper(wchar chw)
{
    UpperRgchw(&chw, 1);
    return chw;
}
inline wchar ChwLower(wchar chw)
{
    LowerRgchw(&chw, 1);
    return chw;
}

#ifdef UNICODE
inline void UpperRgch(achar *prgch, int32_t cch)
{
    UpperRgchw(prgch, cch);
}
inline void LowerRgch(achar *prgch, int32_t cch)
{
    LowerRgchw(prgch, cch);
}
inline achar ChUpper(achar ch)
{
    UpperRgchw(&ch, 1);
    return ch;
}
inline achar ChLower(achar ch)
{
    LowerRgchw(&ch, 1);
    return ch;
}
#else  //! UNICODE
inline void UpperRgch(achar *prgch, int32_t cch)
{
    UpperRgchs(prgch, cch);
}
inline void LowerRgch(achar *prgch, int32_t cch)
{
    LowerRgchs(prgch, cch);
}
inline achar ChUpper(achar ch)
{
    UpperRgchs(&ch, 1);
    return ch;
}
inline achar ChLower(achar ch)
{
    LowerRgchs(&ch, 1);
    return ch;
}
#endif //! UNICODE

/***************************************************************************
    Translation from one OS to another (eg, Win to Mac, single byte to
    unicode, etc).
***************************************************************************/
int32_t CchTranslateRgb(const void *pvSrc, int32_t cbSrc, int16_t oskSrc, achar *prgchDst, int32_t cchMaxDst);

/***************************************************************************
    These APIs assert if osk specifies a different sized character than
    koskCur uses.
***************************************************************************/
void TranslateRgch(achar *prgch, int32_t cch, int16_t osk, bool fToCur = fTrue);
inline void TranslateSt(PST pst, int16_t osk, bool fToCur = fTrue)
{
    TranslateRgch(pst + 1, CchSt(pst), osk, fToCur);
}
inline void TranslateStz(PSTZ pstz, int16_t osk, bool fToCur = fTrue)
{
    TranslateRgch(pstz + 1, CchStz(pstz), osk, fToCur);
}
inline void TranslateSz(PSZ psz, int16_t osk, bool fToCur = fTrue)
{
    TranslateRgch(psz, CchSz(psz), osk, fToCur);
}

/***************************************************************************
    Testing for type of character.
***************************************************************************/
enum
{
    fchNil = 0x00,

    // can overhang the end of a line and doesn't need to be draw
    fchWhiteOverhang = 0x01,

    // should break a line
    fchBreak = 0x02,

    // may break a line
    fchMayBreak = 0x04,

    // should be totally ignored (and not draw)
    fchIgnore = 0x08,

    // some sort of control character
    fchControl = 0x10,

    // a tab character
    fchTab = 0x20,
};

uint32_t GrfchFromCh(achar ch);

/***************************************************************************
    The hexadecimal digits 0 - 9, A - F.
***************************************************************************/
extern const achar vrgchHex[];

/***************************************************************************
    General string class.
***************************************************************************/
typedef class STN *PSTN;
class STN
{
    ASSERT

  private:
    achar _rgch[kcchMaxStn + 2];

  public:
    STN(void)
    {
        _rgch[0] = _rgch[1] = 0;
        AssertThis(0);
    }
    STN(STN &stnSrc);
    STN(PCSZ pszSrc);

    // pointers to the data - these should be considered readonly!
    const achar *Prgch(void)
    {
        AssertThis(0);
        return _rgch + 1;
    }
    const PSZ Psz(void)
    {
        AssertThis(0);
        return _rgch + 1;
    }
    PST Pst(void)
    {
        AssertThis(0);
        return _rgch;
    }
    PSTZ Pstz(void)
    {
        AssertThis(0);
        return _rgch;
    }
    int32_t Cch(void)
    {
        AssertThis(0);
        return (uchar)_rgch[0];
    }

    // setting the string
    void SetNil(void)
    {
        AssertThis(0);
        _rgch[0] = _rgch[1] = 0;
    }
    void SetRgch(const achar *prgchSrc, int32_t cch);
    void SetSz(const PCSZ pszSrc)
    {
        SetRgch(pszSrc, CchSz(pszSrc));
    }
    void SetSt(PST pstSrc)
    {
        SetRgch(PrgchSt(pstSrc), CchSt(pstSrc));
    }
    void SetStz(PSTZ pstzSrc)
    {
        SetRgch(PszStz(pstzSrc), CchStz(pstzSrc));
    }
    void SetSzs(PSZS pszsSrc);
    void SetUtf8Sz(PU8SZ pu8szSrc);

    // assignment operators
    STN &operator=(STN &stnSrc);
    STN &operator=(PCSZ pszSrc)
    {
        SetSz(pszSrc);
        return *this;
    }

    // getting the string into a buffer
    void GetRgch(achar *prgchDst)
    {
        AssertThis(0);
        CopyPb(Prgch(), prgchDst, Cch() * SIZEOF(achar));
    }
    void GetSz(PSZ pszDst)
    {
        AssertThis(0);
        CopyPb(Psz(), pszDst, (Cch() + kcchExtraSz) * SIZEOF(achar));
    }
    void GetSt(PST pstDst)
    {
        AssertThis(0);
        CopyPb(Pst(), pstDst, (Cch() + kcchExtraSt) * SIZEOF(achar));
    }
    void GetStz(PSTZ pstzDst)
    {
        AssertThis(0);
        CopyPb(Pstz(), pstzDst, (Cch() + kcchExtraStz) * SIZEOF(achar));
    }
    void GetSzs(PSZS pszs);
    void GetUtf8Sz(U8SZ pszutf8);

    // modifying the string
    void Delete(int32_t ich, int32_t cch = kcchMaxStn);
    bool FAppendRgch(const achar *prgchSrc, int32_t cch);
    bool FAppendCh(achar chSrc)
    {
        return FAppendRgch(&chSrc, 1);
    }
    bool FAppendSz(const achar *pszSrc)
    {
        return FAppendRgch(pszSrc, CchSz((const PSZ)pszSrc));
    }
    bool FAppendStn(PSTN pstnSrc)
    {
        return FAppendRgch(pstnSrc->Prgch(), pstnSrc->Cch());
    }
    bool FInsertRgch(int32_t ich, const achar *prgchSrc, int32_t cch);
    bool FInsertCh(int32_t ich, achar chSrc)
    {
        return FInsertRgch(ich, &chSrc, 1);
    }
    bool FInsertStn(int32_t ich, PSTN pstnSrc)
    {
        return FInsertRgch(ich, pstnSrc->Prgch(), pstnSrc->Cch());
    }

    // for testing equality
    bool FEqualRgch(const achar *prgch, int32_t cch);
    bool FEqualSz(const PCSZ psz)
    {
        return FEqualRgch(psz, CchSz(psz));
    }
    bool FEqual(PSTN pstn)
    {
        return FEqualRgch(pstn->Prgch(), pstn->Cch());
    }
    bool FEqualUserRgch(const achar *prgch, int32_t cch, uint32_t grfstn = fstnIgnoreCase);
    bool FEqualUserSz(const PSZ psz, uint32_t grfstn = fstnIgnoreCase)
    {
        return FEqualUserRgch(psz, CchSz(psz), grfstn);
    }
    bool FEqualUser(PSTN pstn, uint32_t grfstn = fstnIgnoreCase)
    {
        return FEqualUserRgch(pstn->Prgch(), pstn->Cch(), grfstn);
    }

    // for sorting
    uint32_t FcmpCompare(PSTN pstn)
    {
        return ::FcmpCompareRgch(Prgch(), Cch(), pstn->Prgch(), pstn->Cch());
    }
    uint32_t FcmpCompareUser(PSTN pstn, uint32_t grfstn = fstnIgnoreCase)
    {
        return ::FcmpCompareUserRgch(Prgch(), Cch(), pstn->Prgch(), pstn->Cch(), grfstn);
    }

    // storing and retrieving strings to other buffers (or file).
    int32_t CbData(void);
    void GetData(void *pv);
    bool FSetData(void *pv, int32_t cbMax, int32_t *pcbRead = pvNil);
    bool FWrite(PBLCK pblck, int32_t ib);
    bool FRead(PBLCK pblck, int32_t ib, int32_t *pcbRead = pvNil);

    bool FFormat(PSTN pstnFormat, ...);
    bool FFormatSz(const PCSZ pszFormat, ...);
    bool FFormatRgch(const achar *prgchFormat, int32_t cchFormat, va_list valData);
    bool FGetLw(int32_t *plw, int32_t lwBase = 0);
    bool FExpandControls(void);
};

#endif // UTILSTR_H
