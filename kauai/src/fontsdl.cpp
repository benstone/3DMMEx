/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    SDL font routines.

***************************************************************************/
#include "frame.h"
ASSERTNAME

#include "gfx.h"
#include "fontsdl.h"

RTCLASS(SDLF)

// TODO: add destructor to NTL to ensure all TTF_Fonts are released

/***************************************************************************
    Assert the validity of the font list.
***************************************************************************/
void NTL::AssertValid(uint32_t grf)
{
    NTL_PAR::AssertValid(0);
    AssertPo(_pgst, 0);
}

/***************************************************************************
    Mark memory for the font table.
***************************************************************************/
void NTL::MarkMem(void)
{
    AssertValid(0);
    NTL_PAR::MarkMem();
    MarkMemObj(_pgst);

    for (int32_t onn = 0; onn < _pgst->IstnMac(); onn++)
    {
        SDLF *sdlf = pvNil;
        _pgst->GetExtra(onn, &sdlf);
        MarkMemObj(sdlf);
    }
}

/***************************************************************************
    Initialize the font table.
***************************************************************************/
bool NTL::FInit(void)
{
    STN stnFontName, stnFontPath;
    FNI fniFont;
    SDLF *fntComicSans = pvNil;
    int ret;

    // Initialize SDL TTF
    ret = TTF_Init();
    if (ret != 0)
    {
        Bug("TTF_Init failed");
        PushErc(ercGfxNoFontList);
        return fFalse;
    }

    // Allocate GST to map font names/numbers to an SDLFont class
    if (pvNil == (_pgst = GST::PgstNew(SIZEOF(SDLF *))))
        goto LFail;

    // TODO: enumerate fonts
    // For now we will add exactly one font to the list
    stnFontName = "Comic Sans MS";
    stnFontPath = "C:\\windows\\fonts\\comicbd.ttf";

    AssertDo(fniFont.FBuildFromPath(&stnFontPath), "Could not build path to font");
    AssertDo(fntComicSans = SDLF::PsdlfNew(&fniFont), "Failed to allocate font");

    if (fntComicSans == pvNil)
    {
        goto LFail;
    }

    // Move pointer to SDLF to the GST
    if (_pgst->FAddStn(&stnFontName, &fntComicSans, pvNil))
    {
        fntComicSans = pvNil;
    }
    else
    {
        goto LFail;
    }

    return fTrue;

LFail:
    ReleasePpo(&fntComicSans);
    return fFalse;
}

/***************************************************************************
    Return true iff the font is a fixed pitch font.
***************************************************************************/
bool NTL::FFixedPitch(int32_t onn)
{
    RawRtn();
    return fFalse;
}

// Return the TTF_Font for the given font number
TTF_Font *NTL::TtfFontFromOnn(int32_t onn)
{
    SDLF *fntThis = pvNil;
    TTF_Font *ttfThis = pvNil;
    _pgst->GetExtra(onn, &fntThis);

    if (fntThis != pvNil)
    {
        ttfThis = fntThis->PttfFont();
    }

    // TODO: REFACTOR: Pass DSF* to this function so that we can return the correct fonts for different styles.
    // Some fonts use separate TTF files for bold/italic. Critically for 3DMM, one of these fonts is Comic Sans MS.
    // We need to return the correct TTF file given the flags in the DSF.

    return ttfThis;
}

PSDLF SDLF::PsdlfNew(PFNI pfniFont)
{
    PSDLF psdlf = pvNil;

    if (pvNil == (psdlf = NewObj SDLF))
    {
        PushErc(ercOomNew);
        goto LFail;
    }

    psdlf->_fniFont = *pfniFont;

    return psdlf;

LFail:
    if (psdlf)
    {
        ReleasePpo(&psdlf);
    }
    return pvNil;
}

TTF_Font *SDLF::PttfFont()
{
    // Load the font on first use
    if (_ttfFont == pvNil && !_fLoadFailed)
    {
        STN stnFontPath;
        _fniFont.GetStnPath(&stnFontPath);
        _ttfFont = TTF_OpenFont(stnFontPath.Psz(), 0);

        if (_ttfFont == pvNil)
        {
            // Loading the font failed
            PushErc(ercGfxCantSetFont);
            PCSZ pszErr = TTF_GetError();
            Assert(0, pszErr);

            // Don't try to load it again
            _fLoadFailed = fTrue;
        }
    }

    return _ttfFont;
}

SDLF::~SDLF()
{
    // Free font
    if (_ttfFont != pvNil)
    {
        TTF_CloseFont(_ttfFont);
        _ttfFont = pvNil;
    }
}
