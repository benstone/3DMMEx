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

NTL::~NTL(void)
{
    if (_pgst != pvNil)
    {
        for (int32_t onn = 0; onn < _pgst->IvMac(); onn++)
        {
            PGL pgl;
            _pgst->GetExtra(onn, &pgl);
            if (pgl != pvNil)
            {
                PSDLF psdlf = pvNil;
                while (pgl->FPop(&psdlf))
                {
                    ReleasePpo(&psdlf);
                }
            }

            ReleasePpo(&pgl);
        }
    }
    ReleasePpo(&_pgst);
}

#ifdef DEBUG
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
        PGL pglsdlf = pvNil;
        _pgst->GetExtra(onn, &pglsdlf);
        if (pglsdlf != pvNil)
        {
            MarkMemObj(pglsdlf);
            for (int32_t isdlf = 0; isdlf < pglsdlf->IvMac(); isdlf++)
            {
                PSDLF psdlf;
                pglsdlf->Get(isdlf, &psdlf);
                MarkMemObj(psdlf);
            }
        }
    }
}

#endif // DEBUG

/***************************************************************************
    Initialize the font table.
***************************************************************************/
bool NTL::FInit(void)
{
    STN stnFontName, stnFontPath;
    FNI fniFont;
    PSDLF psdlfComicSans = pvNil;
    PGL pglsdlf = pvNil;
    int32_t onn;
    int ret;

    // Initialize SDL TTF
    ret = TTF_Init();
    if (ret != 0)
    {
        Bug("TTF_Init failed");
        PushErc(ercGfxNoFontList);
        return fFalse;
    }

    // Allocate GST to store font face names
    if (pvNil == (_pgst = GST::PgstNew(sizeof(PGL))))
        goto LFail;

    // TODO: enumerate fonts
    // For now we will add exactly one font to the list
    stnFontName = "Comic Sans MS";

    // Create list to map a font face to SDL fonts
    if (pvNil == (pglsdlf = GL::PglNew(sizeof(PSDLF), 0)))
        goto LFail;

    // Add font face to list
    AssertDo(_pgst->FAddStn(&stnFontName, &pglsdlf, &onn), "Could not add font name to list");

    // Create fonts

    // Comic Sans MS Bold and Italic
    stnFontPath = "C:\\windows\\fonts\\comicz.ttf";
    AssertDo(fniFont.FBuildFromPath(&stnFontPath), "Could not build path to font");
    AssertDo(psdlfComicSans = SDLF::PsdlfNew(&fniFont, (fontBold | fontItalic)), "Could not allocate font");
    pglsdlf->FAdd(&psdlfComicSans);

    // Comic Sans MS Italic
    stnFontPath = "C:\\windows\\fonts\\comici.ttf";
    AssertDo(fniFont.FBuildFromPath(&stnFontPath), "Could not build path to font");
    AssertDo(psdlfComicSans = SDLF::PsdlfNew(&fniFont, fontItalic), "Could not allocate font");
    pglsdlf->FAdd(&psdlfComicSans);

    // Comic Sans MS Bold
    stnFontPath = "C:\\windows\\fonts\\comicbd.ttf";
    AssertDo(fniFont.FBuildFromPath(&stnFontPath), "Could not build path to font");
    AssertDo(psdlfComicSans = SDLF::PsdlfNew(&fniFont, fontBold), "Could not allocate font");
    pglsdlf->FAdd(&psdlfComicSans);

    // Comic Sans MS
    stnFontPath = "C:\\windows\\fonts\\comic.ttf";
    AssertDo(fniFont.FBuildFromPath(&stnFontPath), "Could not build path to font");
    AssertDo(psdlfComicSans = SDLF::PsdlfNew(&fniFont, fontAll), "Could not allocate font");
    pglsdlf->FAdd(&psdlfComicSans);

    return fTrue;

LFail:
    ReleasePpo(&psdlfComicSans);
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

TTF_Font *NTL::TtfFontFromDsf(DSF *pdsf)
{
    AssertPo(pdsf, 0);

    PGL pglsdlf = pvNil;
    TTF_Font *pttf = pvNil;
    int32_t grfontWanted = 0;

    if (pdsf == pvNil)
        return pvNil;

    // Find the list of SDL fonts for this font face number
    _pgst->GetExtra(pdsf->onn, &pglsdlf);
    if (pglsdlf == pvNil)
        return pvNil;

    // Go through the font list twice to find the best match
    // First, try for an exact match of font style flags
    // If not found, try matching the font styles with what the font can do
    grfontWanted = pdsf->grfont;
    for (int32_t cact = 0; cact < 2; cact++)
    {
        for (int32_t ifnt = 0; ifnt < pglsdlf->IvMac(); ifnt++)
        {
            PSDLF *ppsdlf = (PSDLF *)pglsdlf->QvGet(ifnt);
            if (ppsdlf != pvNil && *ppsdlf != pvNil)
            {
                int32_t grfont = (*ppsdlf)->Grfont();

                bool fMatch = fFalse;
                if (cact == 0)
                {
                    fMatch = grfont == grfontWanted;
                }
                else if (cact == 1)
                {
                    fMatch = (grfontWanted != 0) && ((grfontWanted & grfont) == grfontWanted);
                    if (!fMatch)
                    {
                        fMatch = (grfont == fontAll);
                    }
                }

                if (fMatch)
                {
                    pttf = (*ppsdlf)->PttfFont();
                    break;
                }
            }
        }

        if (pttf != pvNil)
        {
            break;
        }
    }

    Assert(pttf != pvNil, "Did not match any font");
    return pttf;
}

PSDLF SDLF::PsdlfNew(PFNI pfniFont, int32_t grffont)
{
    PSDLF psdlf = pvNil;

    if (pvNil == (psdlf = NewObj SDLF))
    {
        PushErc(ercOomNew);
        goto LFail;
    }

    psdlf->_fniFont = *pfniFont;
    psdlf->_grfont = grffont;

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
