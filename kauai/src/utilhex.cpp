/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    Functions for converting byte arrays to/from strings

***************************************************************************/

#include "util.h"
ASSERTNAME

#include "utilhex.h"

/**
 * @brief Parse a hex digit
 **/
static bool FLwFromHex(const achar ch, int32_t *plw)
{
    Assert(plw != pvNil, "bad plw");
    if (plw == pvNil)
        return fFalse;

    if (ch >= ChLit('0') && ch <= ChLit('9'))
    {
        *plw = ch - ChLit('0');
        return fTrue;
    }
    else if (ch >= ChLit('A') && ch <= ChLit('F'))
    {
        *plw = ch - ChLit('A') + 10;
        return fTrue;
    }
    else if (ch >= ChLit('a') && ch <= ChLit('f'))
    {
        *plw = ch - ChLit('a') + 10;
        return fTrue;
    }
    return fFalse;
}

bool FRgbFromHexString(PCSZ pszSrc, uint8_t *pbDst, size_t cbDst, size_t *pcbOut)
{
    AssertSz(pszSrc);
    AssertNilOrPvCb(pbDst, cbDst);

    size_t cchSrc, cbEncoded, ibDst;

    if (pszSrc == pvNil || pcbOut == pvNil)
        return fFalse;

    // String length should be a multiple of two
    cchSrc = CchSz(pszSrc);
    if (cchSrc % 2 != 0)
        return fFalse;

    cbEncoded = cchSrc / 2;
    ibDst = 0;

    *pcbOut = cbEncoded;

    // Skip decoding if no buffer was given
    if (pbDst == pvNil)
        return fTrue;

    // Ensure we have enough space to store the result
    if (cbEncoded > cbDst)
        return fFalse;

    // Decode the string
    for (size_t ich = 0; ich < cchSrc; ich += 2)
    {
        int32_t lwUpper, lwLower;
        if (!FLwFromHex(pszSrc[ich], &lwUpper) || !FLwFromHex(pszSrc[ich + 1], &lwLower))
        {
            // Invalid hex digits
            *pcbOut = 0;
            return fFalse;
        }

        pbDst[ibDst] = (lwUpper << 4) | lwLower;
        ibDst++;
    }

    return fTrue;
}

/**
 * @brief Convert a nibble to a hex digit
 **/
static achar ChFromNibble(uint8_t bNibble)
{
    if (bNibble < 10)
        return ChLit('0') + bNibble;
    if (bNibble < 16)
        return ChLit('a') + bNibble - 10;

    Bug("Nibble value out of range");
    return ChLit('?');
}

bool FHexStringFromRgb(const uint8_t *pbSrc, size_t cbSrc, PSZ pszDst, size_t cchMax)
{
    AssertPvCb(pbSrc, cbSrc);
    AssertSz(pszDst);

    size_t ib, ich, cchNeeded;

    if (pbSrc == pvNil || pszDst == pvNil || cchMax == 0)
        return fFalse;

    cchNeeded = cbSrc * 2 + 1;
    if (cchNeeded > cchMax)
        return fFalse;

    ich = 0;
    for (ib = 0; ib < cbSrc; ib++)
    {
        uint8_t bCur = pbSrc[ib];
        pszDst[ich++] = ChFromNibble(bCur >> 4);
        pszDst[ich++] = ChFromNibble(bCur & 0xF);
    }

    pszDst[ich] = chNil;

    return fTrue;
}