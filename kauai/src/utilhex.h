/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    Functions for converting byte arrays to/from strings

***************************************************************************/

#ifndef UTILHEX_H
#define UTILHEX_H

/**
 * @brief Decode a hex string to a byte array.
 * If no buffer is given, the size of the encoded data will be returned.
 * @param   pszSrc      Hex-encoded string
 * @param   pbDst       Buffer to write decoded data to. Optional.
 * @param   cbDst       Maximum number of bytes to write
 * @param   pcbOut      Number of bytes that were (or would be) decoded
 */
bool FRgbFromHexString(PCSZ pszSrc, uint8_t *pbDst, size_t cbDst, size_t *pcbOut);

/**
 * @brief Encode a byte array as a hex string
 * @param   pbSrc       Data to encode
 * @param   cbSrc       Length of data to encode
 * @param   pszDst      String buffer to write to
 * @param   cchMax      Maximum number of characters to write
 **/
bool FHexStringFromRgb(const uint8_t *pbSrc, size_t cbSrc, PSZ pszDst, size_t cchMax);

#endif // UTILHEX_h