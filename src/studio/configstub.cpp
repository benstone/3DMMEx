/***************************************************************************

    configstub.cpp: Stub for configuration on non-Windows platforms

    This module uses a static configuration instead of loading settings
    from the Windows registry.

***************************************************************************/

#include "studio.h"

ASSERTNAME

typedef struct StaticConfigItem_t
{
    PCSZ pszValueName;

    // String value
    PCSZ pszValue;

    // Binary data value
    const uint8_t *pbValue;
    int32_t cbValue;

    // Integer value
    uint32_t lwValue;

} StaticConfigItem;

const StaticConfigItem_t _rgconfig[] = {

    // Enable better quality rendering
    {kszBetterSpeedValue, "0", pvNil, pvNil, 0},

    // Play the startup sound
    {kszStartupSoundValue, "1", pvNil, pvNil, 0},

    // Enable stereo sound
    {kszStereoSound, "1", pvNil, pvNil, 0},

    // Enable high quality sound import
    {kszHighQualitySoundImport, "1", pvNil, pvNil},

};

bool FGetSetRegKey(PCSZ pszValueName, void *pvData, int32_t cbData, uint32_t grfreg, bool *pfNoValue)
{
    AssertSz(pszValueName);
    AssertPvCb(pvData, cbData);
    AssertNilOrVarMem(pfNoValue);

    bool fRet = fFalse;
    bool fSetKey, fSetDefault, fString, fBinary;

    fSetKey = grfreg & fregSetKey;
    fSetDefault = grfreg & fregSetDefault;
    fString = grfreg & fregString;
    fBinary = grfreg & fregBinary;

    const void *pvSrc = pvNil;
    int32_t cbSrc = 0;
    int32_t cchValueName = CchSz(pszValueName);

    if (fSetKey || fSetDefault)
    {
        // Setting a value does nothing. Return success to avoid errors.
        return fTrue;
    }

    // Find the requested configuration item
    for (int32_t iv = 0; iv < CvFromRgv(_rgconfig); iv++)
    {
        if (FEqualRgch(pszValueName, cchValueName, _rgconfig[iv].pszValueName, CchSz(_rgconfig[iv].pszValueName)))
        {
            // Check the type requested
            if (fString)
            {
                if (_rgconfig[iv].pszValue != pvNil)
                {
                    AssertSz(_rgconfig[iv].pszValue);
                    pvSrc = _rgconfig[iv].pszValue;
                    cbSrc = CchSz(_rgconfig[iv].pszValue);
                }
            }
            else if (fBinary)
            {
                if (_rgconfig[iv].pbValue != pvNil)
                {
                    pvSrc = _rgconfig[iv].pbValue;
                    cbSrc = _rgconfig[iv].cbValue;
                }
            }
            else
            {
                // Integer value
                pvSrc = &_rgconfig[iv].lwValue;
                cbSrc = SIZEOF(_rgconfig[iv].lwValue);
            }
            fRet = fTrue;
            break;
        }
    }

    if (fRet)
    {
        if (pvSrc != pvNil)
        {
            Assert(cbSrc <= cbData, "Destination buffer too small");
            if (cbSrc <= cbData)
            {
                CopyPb(pvSrc, pvData, cbSrc);
            }
            else
            {
                fRet = fFalse;
            }
        }
    }
    else
    {
        if (pfNoValue != pvNil)
        {
            *pfNoValue = fTrue;
        }
    }

    return fRet;
}
