/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    SDL font enumeration for bundled fonts

***************************************************************************/
#include "frame.h"
ASSERTNAME

#include "gfx.h"
#include "fontsdl.h"

// Get the first TrueType font file in the font folder
static bool FGetFirstFont(PFNI pfniFontDir, PFNI pfniDefaultFont)
{
    AssertPo(pfniFontDir, 0);
    AssertPo(pfniDefaultFont, 0);

    FTG ftgTtf = kftgTtf;
    FNE fne;

    // Return the first TrueType font file in the font directory
    if (!fne.FInit(pfniFontDir, &ftgTtf, 1, 0))
        return fFalse;

    return fne.FNextFni(pfniDefaultFont);
}

bool NTL::_FLoadFontTable()
{
    AssertThis(0);
    Assert(fInitTtf, "TTF_Init should have been called");

    bool fRet = fFalse;
    PGL pglsdlfont = pvNil;
    FNI fniFontDir, fniDefaultFont;

    // Fonts are loaded from the 'fonts' subdirectory in the resources directory.
    AssertDo(fniFontDir.FGetResourcesDir(), "Could not find resources directory");
    STN stnFontDir = PszLit("fonts");
    if (!fniFontDir.FDownDir(&stnFontDir, ffniMoveToDir))
    {
        Bug("Could not find fonts directory");
        goto LFail;
    }

    if (!FAddAllFontsInDir(&fniFontDir))
    {
        Bug("Could not add fonts from system fonts directory");
        goto LFail;
    }

    // Ensure we have at least one font
    if (_pgst->IvMac() == 0)
    {
        goto LFail;
    }

    // Add a default font
    if (FGetFirstFont(&fniFontDir, &fniDefaultFont))
    {
        int32_t onnSystem = 0;
        STN stnT = PszLit("System Default");
        if (FAddFontFile(&fniDefaultFont, &stnT, &onnSystem))
        {
            _onnSystem = onnSystem;
        }
    }
    else
    {
        Bug("Could not find a default font file");
        goto LFail;
    }

    fRet = fTrue;

LFail:
    return fRet;
}
