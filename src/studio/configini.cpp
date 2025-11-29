/***************************************************************************

    configini.cpp: Store configuration in an INI file

***************************************************************************/

#include "studio.h"
#include "utilhex.h"
#include "platform.h"

#include <iniparser.h>

ASSERTNAME

#ifdef UNICODE
#error FIXME: Unicode support
#endif // UNICODE

/**
 * @brief Build a path to the config file
 **/
static bool FFindConfigFile(PFNI pfniConfigFile)
{
    AssertPo(pfniConfigFile, 0);

    STN stnConfigFileName = PszLit("3dmovie.ini");
    STN stnT;
    SZ szPath;

    // Find a platform-specific path to store config files
    ClearPb(szPath, SIZEOF(szPath));
    if (FGetAppConfigDir(szPath, CvFromRgv(szPath)))
    {
        stnT = szPath;
        if (pfniConfigFile->FBuildFromPath(&stnT, kftgDir))
        {
            // Create a subdirectory for 3DMMEx
            stnT = PszLit("3DMMEx");
            if (pfniConfigFile->FDownDir(&stnT, ffniCreateDir | ffniMoveToDir))
            {
                // Set the path to the config file
                if (pfniConfigFile->FSetLeaf(&stnConfigFileName))
                {
                    return fTrue;
                }
            }
        }
    }

    // Could not find a platform-specific path to store config files
    // Put the config in the application's directory instead
    if (!pfniConfigFile->FGetExe())
        return fFalse;
    if (!pfniConfigFile->FSetLeaf(&stnConfigFileName))
        return fFalse;

    return fTrue;
}

bool FGetSetRegKey(PCSZ pszValueName, void *pvData, int32_t cbData, uint32_t grfreg, bool *pfNoValue)
{
    AssertSz(pszValueName);
    AssertPvCb(pvData, cbData);
    AssertNilOrVarMem(pfNoValue);

    bool fRet = fFalse, fNoValue = fFalse;
    bool fSetKey, fSetDefault, fString, fBinary, fInteger;

    fSetKey = grfreg & fregSetKey;
    fSetDefault = grfreg & fregSetDefault;
    fString = grfreg & fregString;
    fBinary = grfreg & fregBinary;
    fInteger = !(fString || fBinary);

    const void *pvSrc = pvNil;
    int32_t cbSrc = 0;
    int32_t cchValueName = CchSz(pszValueName);
    SZ szData;
    STN stnSectionKey;
    STN stnPath;
    FNI fniConfig;
    dictionary *pdict = pvNil;
    PCSZ pszSectionName = PszLit("3dmovie");

    AssertDo(stnSectionKey.FFormatSz(PszLit("%z:%z"), pszSectionName, pszValueName), "Failed to format key name");
    if (!FFindConfigFile(&fniConfig))
    {
        Bug("Could not build path to config file");
        return fFalse;
    }

    fniConfig.GetStnPath(&stnPath);

    // Load the INI file if it exists
    if (fniConfig.TExists() == tYes)
    {
        pdict = iniparser_load(stnPath.Psz());
        Assert(pdict != pvNil, "iniparser_load failed");
    }
    else
    {
        // INI file does not exist
        pdict = dictionary_new(1);
        Assert(pdict != pvNil, "dictionary_new failed");
    }

    if (pdict == pvNil)
    {
        return fFalse;
    }

    if (fSetKey)
    {
        // Create the section if it does not exist
        iniparser_set(pdict, pszSectionName, pvNil);

        STN stnT;
        if (fString)
        {
            PCSZ pszData = (PCSZ)pvData;
            if (cbData != 0)
            {
                AssertSz(pszData);
                stnT.SetSz(pszData);
            }
            fRet = fTrue;
        }
        else if (fInteger)
        {
            Assert(cbData == sizeof(int32_t), "bad data size for integer type");
            stnT.FFormatSz(PszLit("%d"), *(int32_t *)pvData);
            fRet = fTrue;
        }
        else if (fBinary)
        {
            SZ sz = {0};

            fRet = FHexStringFromRgb((uint8_t *)pvData, cbData, (PSZ)&sz, kcchMaxSz);
            if (fRet)
            {
                stnT.SetSz(sz);
            }
        }
        else
        {
            Bug("Unsupported data type");
        }

        if (fRet)
        {
            if (iniparser_set(pdict, stnSectionKey.Psz(), stnT.Psz()) == 0)
            {
                FILE *pfileIni = fopen(stnPath.Psz(), "wb");
                if (pfileIni != pvNil)
                {
                    iniparser_dump_ini(pdict, pfileIni);
                    fclose(pfileIni);
                }
                else
                {
                    fRet = fFalse;
                }
            }
        }
        else
        {
            Bug("iniparser_set failed");
            fRet = fFalse;
        }
    }
    else
    {
        // Get key
        if (iniparser_find_entry(pdict, stnSectionKey.Psz()))
        {
            if (fString)
            {
                PCSZ pszValue = iniparser_getstring(pdict, stnSectionKey.Psz(), pvNil);
                AssertSz(pszValue);
                int32_t cchValue = CchSz(pszValue);
                if (cchValue + 1 < cbData)
                {
                    CopyPb(pszValue, pvData, cchValue);
                    ((uint8_t *)pvData)[cchValue] = chNil;
                    fRet = fTrue;
                }
                else
                {
                    Bug("Buffer not big enough to hold result");
                }
            }
            else if (fBinary)
            {
                PCSZ pszValue = iniparser_getstring(pdict, stnSectionKey.Psz(), pvNil);
                AssertSz(pszValue);
                size_t cbOut = 0;
                fRet = FRgbFromHexString(pszValue, (uint8_t *)pvData, cbData, &cbOut);
            }
            else if (fInteger)
            {
                int32_t lwValue = iniparser_getint(pdict, stnSectionKey.Psz(), 0);
                ClearPb(pvData, cbData);
                Assert(cbData == sizeof(int32_t), "bad data size for integer type");
                *(int32_t *)(pvData) = lwValue;
                fRet = fTrue;
            }
            else
            {
                Bug("Unsupported data type");
            }
        }
        else
        {
            fNoValue = fTrue;

            if (fSetDefault)
            {
                uint32_t grfregNew = grfreg;
                grfregNew |= fregSetKey;
                grfregNew &= ~fregSetDefault;
                fRet = FGetSetRegKey(pszValueName, pvData, cbData, grfregNew, pfNoValue);
            }
        }

        if (pfNoValue)
        {
            *pfNoValue = fNoValue;
        }
    }

    // Cleanup
    iniparser_freedict(pdict);

    return fRet;
}
