/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Copyright (c) Microsoft Corporation

    String manipulation.
    WARNING: Must be in a fixed (pre-loaded) seg on Mac.

***************************************************************************/
#include "util.h"
#if !defined(MAC) && !defined(WIN)
#include <ctype.h>
#endif

ASSERTNAME

#include "chtrans.h"

// Check sizes of character types that are used in the file format
VERIFY_STRUCT_SIZE(schar, 1);
VERIFY_STRUCT_SIZE(wchar, 2);

const achar vrgchHex[] = PszLit("0123456789ABCDEF");

/***************************************************************************
    Constructor for a string based on another string.
***************************************************************************/
STN::STN(STN &stnSrc)
{
    AssertPo(&stnSrc, 0);

    CopyPb(stnSrc._rgch, _rgch, (stnSrc.Cch() + 2) * SIZEOF(achar));
    AssertThis(0);
}

/***************************************************************************
    Constructor for a string based on an sz.
***************************************************************************/
STN::STN(PCSZ pszSrc)
{
    int32_t cch = LwBound(CchSz(pszSrc), 0, kcchMaxStn + 1);

    AssertIn(cch, 0, kcchMaxStn + 1);
    CopyPb(pszSrc, _rgch + 1, cch * SIZEOF(achar));
    _rgch[0] = (achar)cch;
    _rgch[cch + 1] = 0;
    AssertThis(0);
}

/***************************************************************************
    Assignment of one string to another.
***************************************************************************/
STN &STN::operator=(STN &stnSrc)
{
    AssertThis(0);
    AssertPo(&stnSrc, 0);

    CopyPb(stnSrc._rgch, _rgch, (stnSrc.Cch() + 2) * SIZEOF(achar));
    AssertThis(0);
    return *this;
}

/***************************************************************************
    Set the string to the given array of characters.
***************************************************************************/
void STN::SetRgch(const achar *prgchSrc, int32_t cch)
{
    AssertThis(0);
    AssertIn(cch, 0, kcbMax);
    AssertPvCb(prgchSrc, cch * SIZEOF(achar));

    if (cch > kcchMaxStn)
        cch = kcchMaxStn;

    if (cch > 0)
        CopyPb(prgchSrc, _rgch + 1, cch * SIZEOF(achar));
    else
        cch = 0; // for safety

    _rgch[0] = (achar)cch;
    _rgch[cch + 1] = 0;
    AssertThis(0);
}

/***************************************************************************
    Put the zero terminated short character string into the STN.
***************************************************************************/
void STN::SetSzs(PSZS pszsSrc)
{
    AssertThis(0);
    AssertVarMem(pszsSrc);

#ifdef UNICODE
#ifdef WIN

    if (pszsSrc[0] == 0)
    {
        _rgch[1] = 0;
        _rgch[0] = 0;
    }
    else
    {
        int32_t cch = MultiByteToWideChar(CP_ACP, MB_PRECOMPOSED, pszsSrc, -1, _rgch + 1, kcchMaxStn);
        AssertIn(cch, 1, kcchMaxStn + 1);
        if (cch == 0)
        {
            cch = 1;
        }
        _rgch[0] = cch - 1;
        _rgch[cch] = 0;
    }

#endif // WIN
#ifdef MAC
    RawRtn(); // REVIEW shonk: Mac: implement
#endif        // MAC
#else         //! UNICODE
    SetSz(pszsSrc);
#endif        // UNICODE
}

/***************************************************************************
    Put the zero terminated UTF-8 string into the STN.
***************************************************************************/
void STN::SetUtf8Sz(PU8SZ pu8szSrc)
{
    AssertThis(0);

    if (pu8szSrc == pvNil)
    {
        SetNil();
        return;
    }

#ifdef WIN
    int32_t cch;
    int32_t cb;
    wchar wszT[kcchMaxSz];

    // Convert the string to Unicode
    cch = MultiByteToWideChar(CP_UTF8, 0, pu8szSrc, -1, wszT, kcchMaxSz);
    if (cch == 0)
    {
        Bug("Failed to convert string from UTF-8 to wide string");
        SetNil();
        return;
    }

#ifdef UNICODE
    // No more conversion needed
    SetSz(wszT);
#else // !UNICODE

    // Convert the string to the current code page
    char szT[kcchMaxSz];
    cch = WideCharToMultiByte(CP_ACP, 0, wszT, -1, szT, kcchMaxSz, pvNil, pvNil);
    if (cch == 0)
    {
        Bug("Failed to convert string from wide string to ANSI code page");
        SetNil();
        return;
    }
    SetSz(szT);

#endif // UNICODE

#else  // !WIN
    // TODO: Set STN from UTF-8 string
    RawRtn();
    SetNil();
#endif // WIN
}

/***************************************************************************
    Delete (at most) cch characters starting at position ich.
***************************************************************************/
void STN::Delete(int32_t ich, int32_t cch)
{
    AssertThis(0);
    AssertIn(cch, 0, kcbMax);
    int32_t cchCur = Cch();

    if (!FIn(ich, 0, cchCur))
    {
        Assert(ich == cchCur, "Bad character position to delete from");
        return;
    }

    if (ich + cch >= cchCur)
    {
        // delete to the end of the string
        _rgch[0] = (achar)ich;
        _rgch[ich + 1] = 0;
    }
    else
    {
        BltPb(_rgch + ich + cch + 1, _rgch + ich + 1, (cchCur - ich - cch) * SIZEOF(achar));
        _rgch[0] = (achar)(cchCur - cch);
        _rgch[cchCur - cch + 1] = 0;
    }
    AssertThis(0);
}

/***************************************************************************
    Append some characters to the end of the string.
***************************************************************************/
bool STN::FAppendRgch(const achar *prgchSrc, int32_t cch)
{
    AssertThis(0);
    AssertIn(cch, 0, kcbMax);
    AssertPvCb(prgchSrc, cch * SIZEOF(achar));
    bool fRet = fTrue;
    int32_t cchCur = Cch();

    if (cch > kcchMaxStn - cchCur)
    {
        cch = kcchMaxStn - cchCur;
        fRet = fFalse;
    }

    if (cch > 0)
    {
        CopyPb(prgchSrc, _rgch + cchCur + 1, cch * SIZEOF(achar));
        _rgch[0] = (achar)(cchCur + cch);
        _rgch[cchCur + cch + 1] = 0;
    }

    AssertThis(0);
    return fRet;
}

/***************************************************************************
    Insert some characters into the middle of a string.
***************************************************************************/
bool STN::FInsertRgch(int32_t ich, const achar *prgchSrc, int32_t cch)
{
    AssertThis(0);
    AssertIn(cch, 0, kcbMax);
    AssertPvCb(prgchSrc, cch * SIZEOF(achar));
    bool fRet = fTrue;
    int32_t cchCur = Cch();

    ich = LwBound(ich, 0, cchCur + 1);
    if (cch > kcchMaxStn - ich)
    {
        cchCur = ich;
        cch = kcchMaxStn - ich;
        fRet = fFalse;
    }
    else if (cch > kcchMaxStn - cchCur)
    {
        cchCur = kcchMaxStn - cch - ich;
        fRet = fFalse;
    }

    Assert(cchCur + cch <= kcchMaxStn, 0);
    if (cch > 0)
    {
        if (cchCur > ich)
        {
            BltPb(_rgch + ich + 1, _rgch + ich + cch + 1, (cchCur - ich) * SIZEOF(achar));
        }
        CopyPb(prgchSrc, _rgch + ich + 1, cch * SIZEOF(achar));
        _rgch[0] = (achar)(cchCur + cch);
        _rgch[cchCur + cch + 1] = 0;
    }

    AssertThis(0);
    return fRet;
}

/***************************************************************************
    Test whether the given rgch is equal to this string.  This does bytewise
    compare - not user level comparison.
***************************************************************************/
bool STN::FEqualRgch(const achar *prgch, int32_t cch)
{
    AssertThis(0);
    AssertIn(cch, 0, kcbMax);
    AssertPvCb(prgch, cch * SIZEOF(achar));

    return cch == Cch() && FEqualRgb(_rgch + 1, prgch, cch * SIZEOF(achar));
}

/***************************************************************************
    Do user level string equality testing with the options given in grfstn.
***************************************************************************/
bool STN::FEqualUserRgch(const achar *prgch, int32_t cch, uint32_t grfstn)
{
    AssertThis(0);
    AssertIn(cch, 0, kcbMax);
    AssertPvCb(prgch, cch * SIZEOF(achar));

    return ::FEqualUserRgch(Prgch(), Cch(), prgch, cch, grfstn);
}

/***************************************************************************
    Return the buffer size needed by GetData, or the block size needed
    by STN::FWrite.
***************************************************************************/
int32_t STN::CbData(void)
{
    AssertThis(0);

    return SIZEOF(int16_t) + (Cch() + 2) * SIZEOF(achar);
}

/***************************************************************************
    Get the streamed data for the stn. pv should point to a buffer
    CbData() bytes long.
***************************************************************************/
void STN::GetData(void *pv)
{
    AssertThis(0);
    AssertPvCb(pv, CbData());
    int16_t osk = koskCur;

    CopyPb(&osk, pv, SIZEOF(int16_t));
    CopyPb(_rgch, PvAddBv(pv, SIZEOF(int16_t)), (Cch() + 2) * SIZEOF(achar));
}

/***************************************************************************
    Writes the string data to the given block starting at position ib.
***************************************************************************/
bool STN::FWrite(PBLCK pblck, int32_t ib)
{
    AssertThis(0);
    AssertPo(pblck, 0);
    int32_t cbWrite = CbData();
    int32_t cbTot = pblck->Cb();
    int16_t osk = koskCur;

    if (!FIn(ib, 0, cbTot - cbWrite + 1))
    {
        Bug("BLCK is not big enough");
        return fFalse;
    }

    if (!pblck->FWriteRgb(&osk, SIZEOF(osk), ib))
        return fFalse;
    if (!pblck->FWriteRgb(_rgch, cbWrite - SIZEOF(int16_t), ib + SIZEOF(int16_t)))
        return fFalse;

    return fTrue;
}

/***************************************************************************
    Set the string from the given data.
***************************************************************************/
bool STN::FSetData(void *pv, int32_t cbMax, int32_t *pcbRead)
{
    AssertThis(0);
    AssertIn(cbMax, 0, kcbMax);
    AssertPvCb(pv, cbMax);
    AssertNilOrVarMem(pcbRead);
    int32_t cch, ich, ibT, cbT;
    wchar chw;
    int16_t osk;

    ibT = 0;
    if (cbMax < SIZEOF(int16_t) + ibT)
        goto LFail;
    CopyPb(pv, &osk, SIZEOF(int16_t));
    ibT += SIZEOF(int16_t);

    if (osk == koskCur)
    {
        // no translation needed - read the length prefix
        if (cbMax < ibT + SIZEOF(achar))
            goto LFail;
        CopyPb(PvAddBv(pv, ibT), &_rgch[0], SIZEOF(achar));
        ibT += SIZEOF(achar);
        cch = (int32_t)(uchar)_rgch[0];
        if (!FIn(cch, 0, kcchMaxStn + 1))
            goto LFail;

        // read the rest of the string
        cbT = SIZEOF(achar) * (cch + 1);
        if (cbMax < ibT + cbT)
            goto LFail;
        CopyPb(PvAddBv(pv, ibT), _rgch + 1, cbT);
        ibT += cbT;

        // make sure the terminating zero is there
        if (_rgch[cch + 1] != 0)
            goto LFail;

        goto LCheck;
    }

    switch (CbCharOsk(osk))
    {
    case SIZEOF(schar):
        if (ibT + 2 > cbMax)
            goto LFail;

        cch = (int32_t)(uint8_t) * (schar *)PvAddBv(pv, ibT++);
        if (cch > kcchMaxStn || ibT + cch >= cbMax || *(schar *)PvAddBv(pv, ibT + cch) != 0)
        {
            goto LFail;
        }
        _rgch[0] = (achar)CchTranslateRgb(PvAddBv(pv, ibT), cch, osk, _rgch + 1, kcchMaxStn);
        ibT += cch + 1;

        cch = (int32_t)(uchar)_rgch[0];
        _rgch[cch + 1] = 0;
        goto LCheck;

    case SIZEOF(wchar):
        if (ibT + 2 * SIZEOF(wchar) > cbMax)
            goto LFail;
        CopyPb(PvAddBv(pv, ibT), &chw, SIZEOF(wchar));
        ibT += SIZEOF(wchar);

        if (osk == koskUni)
            SwapBytesRgsw(&chw, 1);
        cch = (int32_t)(uint16_t)chw;

        if (cch > kcchMaxStn || ibT + (cch + 1) * SIZEOF(wchar) > cbMax)
            goto LFail;
        CopyPb(PvAddBv(pv, ibT + cch * SIZEOF(wchar)), &chw, SIZEOF(wchar));
        if (chw != 0)
            goto LFail;
        _rgch[0] = (achar)CchTranslateRgb(PvAddBv(pv, ibT), cch * SIZEOF(wchar), osk, _rgch + 1, kcchMaxStn);
        ibT += (cch + 1) * SIZEOF(wchar);

        cch = (int32_t)(uchar)_rgch[0];
        _rgch[cch + 1] = 0;

    LCheck:
        // make sure there aren't any other zeros.
        for (ich = 1; ich <= cch; ich++)
        {
            if (_rgch[ich] == 0)
                goto LFail;
        }
        if (pvNil != pcbRead)
            *pcbRead = ibT;
        else if (ibT != cbMax)
            goto LFail;
        AssertThis(0);
        return fTrue;

    default:
    LFail:
        PushErc(ercStnRead);
        Warn("bad STN data");
        SetNil();
        TrashVar(pcbRead);
        return fFalse;
    }
}

/***************************************************************************
    Read a string from a block.
***************************************************************************/
bool STN::FRead(PBLCK pblck, int32_t ib, int32_t *pcbRead)
{
    AssertThis(0);
    AssertPo(pblck, 0);
    AssertNilOrVarMem(pcbRead);

    int32_t cch, ich, ibT, cbT, cbMax;
    int16_t osk;
    schar chs;
    wchar chw;
    uint8_t rgb[kcbMaxDataStn];

    if (!pblck->FUnpackData())
        return fFalse;
    cbMax = pblck->Cb();

    ibT = ib;
    if (cbMax < SIZEOF(int16_t) + ibT || !pblck->FReadRgb(&osk, SIZEOF(int16_t), ibT))
        goto LFail;
    ibT += SIZEOF(int16_t);

    if (osk == koskCur)
    {
        // no translation needed - read the length prefix
        if (cbMax < ibT + SIZEOF(achar) || !pblck->FReadRgb(&_rgch[0], SIZEOF(achar), ibT))
        {
            goto LFail;
        }
        ibT += SIZEOF(achar);
        cch = (int32_t)(uchar)_rgch[0];
        if (!FIn(cch, 0, kcchMaxStn + 1))
            goto LFail;

        // read the rest of the string
        cbT = SIZEOF(achar) * (cch + 1);
        if (cbMax < ibT + cbT || !pblck->FReadRgb(_rgch + 1, cbT, ibT))
            goto LFail;
        ibT += cbT;

        // make sure the terminating zero is there
        if (_rgch[cch + 1] != 0)
            goto LFail;

        goto LCheck;
    }

    switch (CbCharOsk(osk))
    {
    case SIZEOF(schar):
        if (ibT + 2 > cbMax || !pblck->FReadRgb(&chs, 1, ibT++))
            goto LFail;
        cch = (int32_t)(uint8_t)chs;
        if (cch > kcchMaxStn || ibT + cch >= cbMax || !pblck->FReadRgb(rgb, cch + 1, ibT) || rgb[cch] != 0)
        {
            goto LFail;
        }
        ibT += cch + 1;
        _rgch[0] = (achar)CchTranslateRgb(rgb, cch, osk, _rgch + 1, kcchMaxStn);

        cch = (int32_t)(uchar)_rgch[0];
        _rgch[cch + 1] = 0;
        goto LCheck;

    case SIZEOF(wchar):
        if (ibT + 2 * SIZEOF(wchar) > cbMax || !pblck->FReadRgb(&chw, SIZEOF(wchar), ibT))
        {
            goto LFail;
        }
        ibT += SIZEOF(wchar);

        if (osk == koskUni)
            SwapBytesRgsw(&chw, 1);
        cch = (int32_t)(uint16_t)chw;

        if (cch > kcchMaxStn || ibT + (cch + 1) * SIZEOF(wchar) > cbMax ||
            !pblck->FReadRgb(rgb, (cch + 1) * SIZEOF(wchar), ibT) || ((wchar *)rgb)[cch] != 0)
        {
            goto LFail;
        }
        ibT += (cch + 1) * SIZEOF(wchar);
        _rgch[0] = (achar)CchTranslateRgb(rgb, cch * SIZEOF(wchar), osk, _rgch + 1, kcchMaxStn);

        cch = (int32_t)(uchar)_rgch[0];
        _rgch[cch + 1] = 0;

    LCheck:
        // make sure there aren't any other zeros.
        for (ich = 1; ich <= cch; ich++)
        {
            if (_rgch[ich] == 0)
                goto LFail;
        }
        if (pvNil != pcbRead)
            *pcbRead = ibT;
        else if (ibT != cbMax)
            goto LFail;
        AssertThis(0);
        return fTrue;

    default:
    LFail:
        PushErc(ercStnRead);
        Warn("bad STN data or read failure");
        SetNil();
        TrashVar(pcbRead);
        return fFalse;
    }
}

/***************************************************************************
    Get a zero terminated short string from this string.
***************************************************************************/
void STN::GetSzs(PSZS pszs)
{
    AssertThis(0);
    AssertPvCb(pszs, kcchTotSz);

#ifdef UNICODE
#ifdef WIN

    if (Cch() == 0)
    {
        pszs[0] = 0;
    }
    else
    {
        int32_t cch = WideCharToMultiByte(CP_ACP, 0, _rgch + 1, -1, pszs, kcchMaxSz, pvNil, pvNil);
        if (cch == 0)
        {
            pszs[0] = 0;
        }
        else
        {
            pszs[cch - 1] = 0;
        }
    }

#endif // WIN
#ifdef MAC
    RawRtn(); // REVIEW shonk: Mac: implement
    pszs[0] = 0;
#endif // MAC
#else  //! UNICODE
    CopyPb(_rgch + 1, pszs, Cch() + 1);
#endif // UNICODE
}

/***************************************************************************
    Get a zero terminated UTF-8 string from this string.
***************************************************************************/
void STN::GetUtf8Sz(U8SZ pu8sz)
{
    AssertThis(0);
    AssertPvCb(pu8sz, kcchTotUtf8Sz);

#ifdef WIN32
    int32_t cch;
    int32_t cb;
    const wchar *pwcsT;

    if (Cch() == 0)
    {
        pu8sz[0] = 0;
        return;
    }

#ifdef UNICODE
    // The string is already Unicode, so we can convert it directly to UTF-8
    pwcsT = Psz();
    cch = Cch();
#else  // !UNICODE
    // We have to convert the string to Unicode, then to UTF-8
    wchar wszT[kcchMaxSz];
    cch = MultiByteToWideChar(CP_ACP, 0, Psz(), Cch(), wszT, kcchMaxSz);
    Assert(cch == Cch(), "MultiByteToWideChar did not convert all characters");
    if (cch == 0)
    {
        pu8sz[0] = 0;
        return;
    }
    wszT[cch] = 0;
    pwcsT = wszT;
#endif // UNICODE

    // Convert the string to UTF-8
    cb = WideCharToMultiByte(CP_UTF8, 0, pwcsT, cch, pu8sz, kcchMaxUtf8Sz, pvNil, pvNil);
    Assert(cb != 0, "WideCharToMultiByte failed to convert characters");
    pu8sz[cb] = 0;

#else  // !WIN32
    // TODO: convert STN to UTF-8
    RawRtn();
    pu8sz[0] = 0;
#endif // WIN32
}

/***************************************************************************
    Format this string using the given template string and any additional
    parameters (ala sprintf).  All parameters are assumed to be 4 bytes long.

    Returns false if the string ended up being too long to fit in an stn.
    The following controls are supported:

    %c (int32_t)achar
    %s pstn
    %z psz
    %d signed decimal (int32_t)
    %u unsigned decimal (int32_t)
    %x hex
    %f long as a 4 character value: 'xxxx' (ala FTG and CTG values)
    %% a percent sign

    Supports the following options, in this order:

        Argument reordering ('<', 0 based decimal number, '>')
        Left justify ('-')
        Explicit plus sign ('+')
        Zero padding instead of space padding ('0')
        Minimum field width (decimal number)

    These all go between the '%' and the control letter.  Note that argument
    reordering affects everything after the reordered arg in the control
    string.  Eg, "%<1>d %<0>d %d %d"  will use arguments in the order
    { 1, 0, 1, 2 }.  If you just want to switch two arguments, the one
    following needs a number also.  So the above example would be
    "%<1>d %<0>d %<2>d %d", producing { 1, 0, 2, 3 }.

    WARNING: all arguments should be 4 bytes long.
***************************************************************************/
bool STN::FFormat(PSTN pstnFormat, ...)
{
    AssertThis(0);
    AssertPo(pstnFormat, 0);

    va_list args;
    va_start(args, pstnFormat);
    bool fRet = FFormatRgch(pstnFormat->Prgch(), pstnFormat->Cch(), args);
    va_end(args);

    return fRet;
}

/***************************************************************************
    See comments for STN::FFormat
***************************************************************************/
bool STN::FFormatSz(const PCSZ pszFormat, ...)
{
    AssertThis(0);
    AssertSz(pszFormat);

    va_list args;
    va_start(args, pszFormat);
    bool fRet = FFormatRgch(pszFormat, CchSz(pszFormat), args);
    va_end(args);

    return fRet;
}

/***************************************************************************
    Core routine for sprintf functionality.
***************************************************************************/
bool STN::FFormatRgch(const achar *prgchFormat, int32_t cchFormat, va_list valData)
{
    AssertThis(0);
    AssertIn(cchFormat, 0, kcchMaxStn + 1);
    AssertPvCb(prgchFormat, cchFormat * SIZEOF(achar));

    // Data Write Order - these dwo values are pcode for when to add what
    enum
    {
        dwoPadFirst = 0x0321,
        dwoPadSecond = 0x0312,
        dwoPadLast = 0x0132
    };
    achar *pchOut, *pchOutLim;
    const achar *pchIn, *pchInLim;
    int32_t cch;
    int32_t cchMin;
    int32_t ivArg;
    uint32_t lu, luRad;
    achar ch;
    achar rgchT[kcchMaxStn];
    const achar *prgchTerm;
    achar *prgchTermMut;
    achar chSign, chPad;
    uint32_t dwo;
    PSTN pstn;
    PSZ pszT;
    bool fRet = fFalse;

    pchInLim = (pchIn = prgchFormat) + cchFormat;
    pchOutLim = (pchOut = _rgch + 1) + kcchMaxStn;
    ivArg = 0;
    while (pchIn < pchInLim && pchOut < pchOutLim)
    {
        if ((ch = *pchIn++) != ChLit('%'))
        {
            *pchOut++ = ch;
            continue;
        }

        // pre-fetch the next character
        if (pchIn >= pchInLim)
            goto LBug;
        ch = *pchIn++;
        if (ch == ChLit('%'))
        {
            *pchOut++ = ChLit('%');
            continue;
        }

        dwo = dwoPadFirst;
        chSign = 0;
        chPad = kchSpace;

        if (ch == ChLit('<'))
        {
            ivArg = 0;
            for (;;)
            {
                if (ch < ChLit('0') || ch > ChLit('9'))
                    break;
                ivArg = ivArg * 10 + ch - ChLit('0');

                // pre-fetch the next character
                if (pchIn >= pchInLim)
                    goto LBug;
                ch = *pchIn++;
            }
            if (ch != ChLit('>'))
                goto LBug;
        }

        // get qualifiers (print sign, left justify, etc)
        for (;;)
        {
            switch (ch)
            {
            default:
                goto LGetCchMin;
            case ChLit('-'):
                dwo = dwoPadLast;
                break;
            case ChLit('+'):
                chSign = ChLit('+');
                break;
            case ChLit('0'):
                chPad = ChLit('0');
                dwo = dwoPadSecond;
                break;
            }

            // pre-fetch the next character
            if (pchIn >= pchInLim)
                goto LBug;
            ch = *pchIn++;
        }

    LGetCchMin:
        cchMin = 0;
        for (;;)
        {
            if (ch < ChLit('0') || ch > ChLit('9'))
                break;
            cchMin = cchMin * 10 + ch - ChLit('0');

            // pre-fetch the next character
            if (pchIn >= pchInLim)
                goto LBug;
            ch = *pchIn++;
        }

        // code after the switch assumes that prgchTerm points to the
        // characters to add to the stream and cch is the number of characters
        lu = 0;
        prgchTerm = rgchT;
        switch (ch)
        {
        case ChLit('c'):
            rgchT[0] = (achar)va_arg(valData, uint32_t);
            cch = 1;
            break;

        case ChLit('s'):
            pstn = va_arg(valData, PSTN);
            AssertPo(pstn, 0);
            prgchTerm = pstn->Prgch();
            cch = pstn->Cch();
            break;

        case ChLit('z'):
            pszT = va_arg(valData, PSZ);
            AssertSz(pszT);
            prgchTerm = pszT;
            cch = CchSz(pszT);
            break;

        case ChLit('f'):
            lu = va_arg(valData, uint32_t);
            for (cch = 4; cch-- > 0; lu >>= 8)
            {
                ch = (achar)(lu & 0xFF);
                if (0 == ch)
                    ch = 1;
                rgchT[cch] = ch;
            }
            cch = 4;
            break;

        case ChLit('x'):
            lu = va_arg(valData, uint32_t);
            // if cchMin is not 0, don't make it longer than cchMin
            if (cchMin > 0 && cchMin < 8)
                lu &= (1L << (cchMin * 4)) - 1;
            luRad = 16;
            goto LUnsigned;

        case ChLit('d'):
            lu = va_arg(valData, uint32_t);
            if ((int32_t)lu < 0)
            {
                chSign = ChLit('-');
                lu = -(int32_t)lu;
            }
            luRad = 10;
            goto LUnsigned;

        case ChLit('u'):
            lu = va_arg(valData, uint32_t);
            luRad = 10;
        LUnsigned:
            prgchTermMut = rgchT + CvFromRgv(rgchT);
            prgchTerm = prgchTermMut;
            cch = 0;
            do
            {
                *--prgchTermMut = vrgchHex[lu % luRad];
                cch++;
                lu /= luRad;
            } while (lu != 0);
            prgchTerm -= cch;
            break;

        default:
        LBug:
            Bug("bad format string");
            goto LFail;
        }

        // set cchMin to the number of characters to pad
        cchMin = LwMax(0, cchMin - cch - (chSign != 0));
        if (pchOutLim - pchOut <= cch + cchMin + (chSign != 0))
        {
            // overflowed the output buffer
            goto LFail;
        }

        // arrange the sign, padding and rgch according to dwo
        while (dwo != 0)
        {
            switch (dwo & 0x0F)
            {
            case 1: // add padding
                for (; cchMin > 0; cchMin--)
                    *pchOut++ = chPad;
                break;

            case 2: // add the sign
                if (chSign != 0)
                    *pchOut++ = chSign;
                break;

            case 3: // add the text
                CopyPb(prgchTerm, pchOut, cch * SIZEOF(achar));
                pchOut += cch;
                break;

            default:
                BugVar("bad dwo value", &dwo);
                break;
            }

            dwo >>= 4;
        }

        Assert(pchOut <= pchOutLim, "bad logic above - overflowed the rgch");
    }

    fRet = pchIn == pchInLim;
LFail:
    cch = pchOut - _rgch - 1;
    AssertIn(cch, 0, kcchMaxStn + 1);
    _rgch[0] = (achar)cch;
    _rgch[cch + 1] = 0;
    return fRet;
}

/***************************************************************************
    Parses the STN as a number.  If lwBase is 0, automatically determines
    the base as one of 10, 8 or 16 (as in standard C) and allows leading
    spaces, '+' and '-' signs, and trailing spaces.  Doesn't deal with
    overflow.
***************************************************************************/
bool STN::FGetLw(int32_t *plw, int32_t lwBase)
{
    AssertThis(0);
    AssertVarMem(plw);
    AssertIn(lwBase, 0, 36);
    Assert(lwBase != 1, "base can't be 1");
    int32_t lwDigit;
    achar ch;
    bool fNegative = fFalse;
    PSZ psz = Psz();

    if (lwBase < 2)
    {
        for (;; psz++)
        {
            switch (*psz)
            {
            case ChLit('-'):
                fNegative = !fNegative;
                continue;

            case ChLit('+'):
            case kchSpace:
                continue;
            }
            break;
        }
    }

    *plw = 0;
    if (*psz == 0)
        goto LFail;

    // determine the base if lwBase is zero
    if (0 == lwBase)
    {
        // determine the base
        if (ChLit('0') == psz[0])
        {
            psz++;
            if (ChLit('x') == psz[0] || ChLit('X') == psz[0])
            {
                psz++;
                lwBase = 16;
            }
            else
                lwBase = 8;
        }
        else
            lwBase = 10;
    }

    while (0 != (ch = *psz++))
    {
        if (FIn(ch, ChLit('0'), ChLit('9') + 1))
            lwDigit = ch - ChLit('0');
        else
        {
            if (FIn(ch, ChLit('A'), ChLit('Z') + 1))
                ch += ChLit('a') - ChLit('A');
            else if (!FIn(ch, ChLit('a'), ChLit('z') + 1))
            {
                // not a letter, so only spaces should follow
                for (; ch != 0; ch = *psz++)
                {
                    if (ch != kchSpace)
                        goto LFail;
                }
                break;
            }
            lwDigit = ch - ChLit('a') + 10;
        }

        if (lwDigit > lwBase)
        {
        LFail:
            TrashVar(plw);
            return fFalse;
        }
        *plw = *plw * lwBase + lwDigit;
    }

    if (fNegative)
        *plw = -*plw;

    return fTrue;
}

/***************************************************************************
    Doubles any backslash characters in the string and replaces " literals
    with \".
***************************************************************************/
bool STN::FExpandControls(void)
{
    AssertThis(0);
    achar rgch[kcchMaxStn];
    achar *pchSrc, *pchDst, *pchLim, ch;
    int32_t cch;
    bool fAny;
    bool fRet = fFalse;

    fAny = fFalse;
    pchSrc = Psz();
    pchDst = rgch;
    pchLim = pchDst + kcchMaxStn;
    for (cch = Cch(); cch-- > 0;)
    {
        if (pchDst >= pchLim)
            goto LFail;
        ch = *pchSrc++;
        switch (ch)
        {
        case kchTab:
            ch = ChLit('t');
            goto LExpand;
        case kchReturn:
            ch = ChLit('n');
            goto LExpand;
        case ChLit('\\'):
        case ChLit('"'):
        LExpand:
            if (pchDst + 1 >= pchLim)
                goto LFail;
            *pchDst++ = ChLit('\\');
            fAny = fTrue;
            break;
        }
        *pchDst++ = ch;
    }
    fRet = fTrue;

LFail:
    if (fAny)
        SetRgch(rgch, pchDst - rgch);

    return fRet;
}

#ifdef DEBUG
/***************************************************************************
    Assert the validity of a STN.
***************************************************************************/
void STN::AssertValid(uint32_t grf)
{
    AssertThisMem();

    achar *pch;
    int32_t cch = (int32_t)(uchar)_rgch[0];

    AssertIn(cch, 0, kcchMaxStn + 1);
    Assert(_rgch[cch + 1] == 0, "missing termination byte");

    for (pch = _rgch + 1; *pch != 0; pch++)
        ;

    Assert(pch - _rgch == cch + 1, "internal null characters");
}
#endif // DEBUG

/***************************************************************************
    Check the validity of an st (make sure no zeros are in it).
***************************************************************************/
bool FValidSt(PST pst)
{
    AssertVarMem(pst);
    achar *pch;
    int32_t cch = (int32_t)(uchar)pst[0];

    if (!FIn(cch, 0, kcchMaxSt + 1))
        return fFalse;

    AssertPvCb(pst, (cch + kcchExtraSt) * SIZEOF(achar));
    for (pch = PrgchSt(pst); cch > 0 && *pch != 0; cch--, pch++)
        ;
    return (cch == 0);
}

/***************************************************************************
    Check the validity of an stz
***************************************************************************/
bool FValidStz(PSTZ pstz)
{
    AssertVarMem(pstz);
    return FValidSt(pstz) && 0 == PszStz(pstz)[CchSt(pstz)];
}

/***************************************************************************
    Find the length of a zero terminated string.
***************************************************************************/
int32_t CchSz(const PCSZ psz)
{
    // WARNING: don't call AssertSz, since AssertSz calls CchSz!
    AssertVarMem(psz);
    const achar *pch;

    for (pch = psz; *pch != 0; pch++)
        ;
    Assert(pch - psz <= kcchMaxSz, "sz too long");
    AssertPvCb(psz, (pch - psz + 1) * SIZEOF(achar));
    return pch - psz;
}

/***************************************************************************
    Do string equality testing.  This does byte-wise comparison for
    internal (non-user) use only!
***************************************************************************/
bool FEqualRgch(const achar *prgch1, int32_t cch1, const achar *prgch2, int32_t cch2)
{
    AssertIn(cch1, 0, kcbMax);
    AssertPvCb(prgch1, cch1 * SIZEOF(achar));
    AssertIn(cch2, 0, kcbMax);
    AssertPvCb(prgch2, cch2 * SIZEOF(achar));

    return cch1 == cch2 && FEqualRgb(prgch1, prgch2, cch1 * SIZEOF(achar));
}

/***************************************************************************
    Do string comparison for sorting.  This is byte-wise for internal
    (non-user) sorting only!  The sorting is byte-order independent.
    fcmpLt means that string 1 is less than string 2.
***************************************************************************/
uint32_t FcmpCompareRgch(const achar *prgch1, int32_t cch1, const achar *prgch2, int32_t cch2)
{
    AssertIn(cch1, 0, kcbMax);
    AssertPvCb(prgch1, cch1 * SIZEOF(achar));
    AssertIn(cch2, 0, kcbMax);
    AssertPvCb(prgch2, cch2 * SIZEOF(achar));
    int32_t ich, cbTot, cbMatch;

    if (cch1 < cch2)
        return fcmpLt;
    if (cch1 > cch2)
        return fcmpGt;

    cbTot = cch1 * SIZEOF(achar);
    cbMatch = CbEqualRgb(prgch1, prgch2, cbTot);
    AssertIn(cbMatch, 0, cbTot + 1);
    if (cbTot == cbMatch)
        return fcmpEq;

    ich = cbMatch / SIZEOF(achar);
    Assert(prgch1[ich] != prgch2[ich], 0);

    return prgch1[ich] < prgch2[ich] ? fcmpLt : fcmpGt;
}

/***************************************************************************
    User level equality testing of strings.
***************************************************************************/
bool FEqualUserRgch(const achar *prgch1, int32_t cch1, const achar *prgch2, int32_t cch2, uint32_t grfstn)
{
    AssertIn(cch1, 0, kcbMax);
    AssertPvCb(prgch1, cch1 * SIZEOF(achar));
    AssertIn(cch2, 0, kcbMax);
    AssertPvCb(prgch2, cch2 * SIZEOF(achar));
    int32_t cchBuf;
    achar rgch1[kcchMaxStn];
    achar rgch2[kcchMaxStn];

    // REVIEW shonk: implement for real
    if (!(grfstn & fstnIgnoreCase))
        return cch1 == cch2 && FEqualRgb(prgch1, prgch2, cch1 * SIZEOF(achar));

    if (cch1 != cch2)
        return fFalse;

    while (cch1 > 0)
    {
        cchBuf = LwMin(kcchMaxStn, cch1);
        CopyPb(prgch1, rgch1, cchBuf * SIZEOF(achar));
        CopyPb(prgch2, rgch2, cchBuf * SIZEOF(achar));
#ifdef WIN
        CharUpperBuff(rgch1, cchBuf);
        CharUpperBuff(rgch2, cchBuf);
#else  //! WIN
        RawRtn(); // REVIEW shonk: Mac: implement
#endif //! WIN
        if (!FEqualRgb(rgch1, rgch2, cchBuf * SIZEOF(achar)))
            return fFalse;
        prgch1 += cchBuf;
        prgch2 += cchBuf;
        cch1 -= cchBuf;
    }

    return fTrue;
}

/***************************************************************************
    Do user level string comparison with the given options.
***************************************************************************/
uint32_t FcmpCompareUserRgch(const achar *prgch1, int32_t cch1, const achar *prgch2, int32_t cch2, uint32_t grfstn)
{
    AssertIn(cch1, 0, kcbMax);
    AssertPvCb(prgch1, cch1 * SIZEOF(achar));
    AssertIn(cch2, 0, kcbMax);
    AssertPvCb(prgch2, cch2 * SIZEOF(achar));

#ifdef WIN
    int32_t lw;

    lw =
        CompareString(LOCALE_USER_DEFAULT, (grfstn & fstnIgnoreCase) ? NORM_IGNORECASE : 0, prgch1, cch1, prgch2, cch2);
    switch (lw)
    {
    case 1:
        return fcmpLt;
    case 2:
        return fcmpEq;
    case 3:
        return fcmpGt;
    default:
        Bug("why did CompareString fail?");
        return FcmpCompareRgch(prgch1, cch1, prgch2, cch2);
    }
#else  //! WIN
    // REVIEW shonk: Mac: implement for real
    RawRtn();
    return FcmpCompareRgch(prgch1, cch1, prgch2, cch2);
#endif //! WIN
}

/***************************************************************************
    Map an array of short characters to upper case equivalents.
***************************************************************************/
void UpperRgchs(schar *prgchs, int32_t cchs)
{
    AssertIn(cchs, 0, kcbMax);
    AssertPvCb(prgchs, cchs);
    int32_t ichs;
    static bool _fInited;

    if (!_fInited)
    {
        for (ichs = 0; ichs < 256; ichs++)
            _mpchschsUpper[ichs] = (uint8_t)ichs;
#ifdef MAC
        UppercaseText(_mpchschsUpper, 256, smSystemScript);
#elif defined(WIN)
        CharUpperBuffA(_mpchschsUpper, 256);
#else
        for (ichs = 0; ichs < 256; ichs++)
            _mpchschsUpper[ichs] = toupper(_mpchschsUpper[ichs]);
#endif
        _fInited = fTrue;
    }

    for (; cchs-- != 0; prgchs++)
        *prgchs = _mpchschsUpper[(uint8_t)*prgchs];
}

/***************************************************************************
    Map an array of characters to lower case equivalents.
***************************************************************************/
void LowerRgchs(schar *prgchs, int32_t cchs)
{
    AssertIn(cchs, 0, kcbMax);
    AssertPvCb(prgchs, cchs);
    int32_t ichs;
    static bool _fInited;

    if (!_fInited)
    {
        for (ichs = 0; ichs < 256; ichs++)
            _mpchschsLower[ichs] = (uint8_t)ichs;
#ifdef MAC
        LowercaseText(_mpchschsLower, 256, smSystemScript);
#elif defined(WIN)
        CharLowerBuffA(_mpchschsLower, 256);
#else
        for (ichs = 0; ichs < 256; ichs++)
            _mpchschsLower[ichs] = tolower(_mpchschsLower[ichs]);
#endif
        _fInited = fTrue;
    }

    for (; cchs-- != 0; prgchs++)
        *prgchs = _mpchschsLower[(uint8_t)*prgchs];
}

/***************************************************************************
    Map an array of unicode characters to upper case equivalents.
***************************************************************************/
void UpperRgchw(wchar *prgchw, int32_t cchw)
{
    AssertIn(cchw, 0, kcbMax);
    AssertPvCb(prgchw, cchw * SIZEOF(wchar));

#if defined(WIN)
#if defined(UNICODE)
    CharUpperBuffW(prgchw, cchw);
#else
    CharUpperBuffA(reinterpret_cast<char *>(prgchw), cchw);
#endif //! UNICODE
#else  //! WIN
    RawRtn(); // REVIEW shonk: Mac: implement UpperRgchw
#endif //! WIN
}

/***************************************************************************
    Map an array of unicode characters to lower case equivalents.
***************************************************************************/
void LowerRgchw(wchar *prgchw, int32_t cchw)
{
    AssertIn(cchw, 0, kcbMax);
    AssertPvCb(prgchw, cchw * SIZEOF(wchar));

    AssertIn(cchw, 0, kcbMax);
    AssertPvCb(prgchw, cchw * SIZEOF(wchar));

#if defined(WIN)
#if defined(UNICODE)
    CharLowerBuffW(prgchw, cchw);
#else
    CharLowerBuffA(reinterpret_cast<char *>(prgchw), cchw);
#endif
#else  //! WIN
    RawRtn(); // REVIEW shonk: Mac: implement UpperRgchw
#endif //! WIN
}

/***************************************************************************
    Translate text from the indicated source character set to koskCur.
***************************************************************************/
int32_t CchTranslateRgb(const void *pvSrc, int32_t cbSrc, int16_t oskSrc, achar *prgchDst, int32_t cchMaxDst)
{
    AssertPvCb(pvSrc, cbSrc);
    AssertOsk(oskSrc);
    AssertPvCb(prgchDst, cchMaxDst * SIZEOF(achar));
    int32_t cchT;

#ifdef WIN
#ifdef UNICODE

    switch (oskSrc)
    {
    default:
        return 0;

    case koskSbWin:
    case koskSbMac:
        return MultiByteToWideChar(oskSrc == koskSbWin ? CP_ACP : CP_MACCP, MB_PRECOMPOSED, (LPSTR)pvSrc, cbSrc,
                                   prgchDst, cchMaxDst);

    case koskUniMac:
        if (cbSrc % SIZEOF(wchar) != 0)
            return 0;

        cchT = cbSrc / SIZEOF(wchar);
        if (0 == cchMaxDst)
            return cchT;
        if (cchT > cchMaxDst)
            return 0;

        CopyPb(pvSrc, prgchDst, cchT * SIZEOF(achar));
        SwapBytesRgsw(prgchDst, cchT);
        return cchT;
    }

#else //! UNICODE

    achar *pchSrc, *pchDst;

    switch (oskSrc)
    {
    default:
        return 0;

    case koskSbMac:
        if (0 == cchMaxDst)
            return cbSrc;
        if (cbSrc > cchMaxDst)
            return 0;

        pchSrc = (achar *)pvSrc;
        for (pchDst = prgchDst, cchT = cbSrc; cchT > 0; cchT--)
        {
            uint8_t bT = (uint8_t)*pchSrc++;
            if (bT >= (uint8_t)0x80)
                *pchDst++ = _mpchschsMacToWin[bT - (uint8_t)0x80];
            else
                *pchDst++ = (achar)bT;
        }
        return cbSrc;

    case koskUniWin:
    case koskUniMac:
        if (cbSrc % SIZEOF(wchar) != 0)
            return 0;

        // TODO: Refactor to make a copy of the string instead of modifying it in-place
        // swap byte order
        if (oskSrc == koskUniMac)
            RawRtn(); // SwapBytesRgsw(pvSrc, cbSrc / SIZEOF(wchar));

        cchT = WideCharToMultiByte(CP_ACP, 0, (LPWSTR)pvSrc, cbSrc / SIZEOF(wchar), prgchDst, cchMaxDst, pvNil, pvNil);

        // if (oskSrc == koskUniMac)
        // SwapBytesRgsw(pvSrc, cbSrc / SIZEOF(wchar));
        return cchT;
    }

#endif //! UNICODE
#endif // WIN

#ifdef MAC
#ifdef UNICODE

    int32_t cchDst;
    schar *pchsSrc;
    achar *pchDst;

    switch (oskSrc)
    {
    default:
        return 0;

    case koskSbWin:
        if (0 == cchMaxDst)
            return cbSrc;
        if (cbSrc > cchMaxDst)
            return 0;

        pchsSrc = (schar *)pvSrc;
        for (pchDst = prgch, cchT = cbSrc; cchT > 0; cchT--)
            *pchDst++ = (achar)(uint8_t)*pchsSrc++;
        return cbSrc;

    case koskSbMac:
        if (0 == cchMaxDst)
            return cbSrc;
        if (cbSrc > cchMaxDst)
            return 0;

        pchsSrc = (schar *)pvSrc;
        for (pchDst = prgch, cchT = cbSrc; cchT > 0; cchT--)
            pchsSrc = (schar *)pvSrc;
        {
            uint8_t bT = (uint8_t)*pchsSrc++;
            if (bT >= (uint8_t)0x80)
                *pchDst++ = (achar)_mpchschsMacToWin[bT - (uint8_t)0x80];
            else
                *pchDst++ = (achar)bT;
        }
        return cbSrc;

    case koskUniWin:
        if (cbSrc % SIZEOF(wchar) != 0)
            return 0;

        cchT = cbSrc / SIZEOF(wchar);
        if (0 == cchMaxDst)
            return cchT;
        if (cchT > cchMaxDst)
            return 0;

        CopyPb(pvSrc, prgchDst, cchT * SIZEOF(achar));
        SwapBytesRgsw(prgchDst, cchT);
        return cchT;
    }

#else //! UNICODE

    achar *pchSrc, *pchDst;

    switch (oskSrc)
    {
    default:
        return fFalse;

    case koskSbWin:
        if (0 == cchMaxDst)
            return cbSrc;
        if (cbSrc > cchMaxDst)
            return 0;

        pchSrc = (achar *)pvSrc;
        for (pchDst = prgchDst, cchT = cbSrc; cchT > 0; cchT--)
        {
            uint8_t bT = (uint8_t)*pchSrc++;
            if (bT >= (uint8_t)0x80)
                *pchDst++ = _mpchschsWinToMac[bT - (uint8_t)0x80];
            else
                *pchDst++ = (achar)bT;
        }
        return cbSrc;

    case koskUniWin:
    case koskUniMac:
        RawRtn(); // REVIEW shonk: Mac: implement koskUniWin, koskUniMac -> koskSbMac
        return 0;
    }

#endif //! UNICODE
#endif // MAC
}

/***************************************************************************
    Translates a string between the current platform and another.  If fToCur
    is true, the translation is from osk to koskCur, otherwise from koskCur
    to osk.
***************************************************************************/
void TranslateRgch(achar *prgch, int32_t cch, int16_t osk, bool fToCur)
{
    AssertPvCb(prgch, cch);
    AssertOsk(osk);
    Assert(osk == koskMac || osk == koskWin, "TranslateRgch can't handle this osk");

    if (koskCur == osk)
        return;

#ifdef UNICODE
    // for unicode, we just have to change the byte ordering
    SwapBytesRgsw(prgch, cch);
#else //! UNICODE
#ifdef MAC
#define FTOCUR !fToCur
#else
#define FTOCUR fToCur
#endif
    auto pmpchschs = FTOCUR ? _mpchschsMacToWin : _mpchschsWinToMac;

    for (; cch > 0; cch--, prgch++)
    {
        if ((uint8_t)*prgch >= (uint8_t)0x80)
            *prgch = pmpchschs[(uint8_t)*prgch - (uint8_t)0x80];
    }
#endif //! UNICODE
}

/***************************************************************************
    Return the type of the character.
    This must follow these implications:
        fchBreak -> fchMayBreak
        fchBreak -> fchControl
        fchIgnore -> fchControl

    REVIEW shonk: make GrfchFromCh handle all unicode characters.
***************************************************************************/
uint32_t GrfchFromCh(achar ch)
{
    switch ((uchar)ch)
    {
    case kchReturn:
        return fchBreak | fchMayBreak | fchControl;

    case kchLineFeed:
        return fchIgnore | fchControl;

    case kchTab:
        return fchTab | fchMayBreak | fchControl;

    case kchSpace:
        return fchWhiteOverhang | fchMayBreak;

#ifdef REVIEW // shonk: implement correctly once we get the tables from MSKK.
#ifdef UNICODE
    // REVIEW shonk: others? 148
    case (uchar)',':
    case (uchar)'.':
    case (uchar)')':
    case (uchar)']':
    case (uchar)'}':
    case (uchar)':':
    case (uchar)';':
    case (uchar)'?':
    case (uchar)'!':
    case (uchar)'.':
    case (uchar)',':
        return fchTestBreak;
#endif // UNICODE
#endif // REVIEW

    case 0x7F:
        return fchControl;

    default:
        if ((uchar)ch < kchSpace)
            return fchControl;

        return fchNil;
    }
}

#ifdef DEBUG
/***************************************************************************
    Validate an osk.
***************************************************************************/
void AssertOsk(int16_t osk)
{
    switch (osk)
    {
    case koskSbMac:
    case koskSbWin:
    case koskUniMac:
    case koskUniWin:
        break;
    default:
        BugVar("bad osk", &osk);
    }
}

/***************************************************************************
    Check the validity of an st (make sure no zeros are in it).
***************************************************************************/
void AssertSt(PST pst)
{
    Assert(FValidSt(pst), "bad st");
}

/***************************************************************************
    Check the validity of an stz.
***************************************************************************/
void AssertStz(PSTZ pstz)
{
    Assert(FValidStz(pstz), "bad stz");
}

/***************************************************************************
    Make sure the sz isn't too long.
***************************************************************************/
void AssertSz(PCSZ psz)
{
    // CchSz does all the asserting we need
    int32_t cch = CchSz(psz);
}

/***************************************************************************
    Check the validity of an st, nil is allowed.
***************************************************************************/
void AssertNilOrSt(PST pst)
{
    if (pst != pvNil)
        AssertSt(pst);
}

/***************************************************************************
    Check the validity of an stz, nil is allowed.
***************************************************************************/
void AssertNilOrStz(PSTZ pstz)
{
    if (pstz != pvNil)
        AssertStz(pstz);
}

/***************************************************************************
    Check the validity of an sz, nil is allowed.
***************************************************************************/
void AssertNilOrSz(PSZ psz)
{
    if (psz != pvNil)
        AssertSz(psz);
}
#endif // DEBUG
