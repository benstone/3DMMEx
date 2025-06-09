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

RTCLASS(SDLFont)
RTCLASS(SDLFontFile)
RTCLASS(SDLFontMemory)

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
                PSDLFont psdlf = pvNil;
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
        PGL pglsdlfont = pvNil;
        _pgst->GetExtra(onn, &pglsdlfont);
        if (pglsdlfont != pvNil)
        {
            MarkMemObj(pglsdlfont);
            for (int32_t isdlf = 0; isdlf < pglsdlfont->IvMac(); isdlf++)
            {
                PSDLFont psdlf;
                pglsdlfont->Get(isdlf, &psdlf);
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
    PSDLFont psdlfComicSans = pvNil;
    PGL pglsdlfont = pvNil;
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

    // Add system font
    stnFontName = "System";
    AssertDo(FAddFontName(stnFontName.Psz(), &onn, &pglsdlfont), "Could not add system font");

    stnFontPath = "C:\\windows\\fonts\\vgasys.fon";
    AssertDo(fniFont.FBuildFromPath(&stnFontPath), "Could not build path to font");
    AssertDo(psdlfComicSans = SDLFontFile::PSDLFontFileNew(&fniFont, (fontBold | fontItalic)),
             "Could not allocate font");
    pglsdlfont->FAdd(&psdlfComicSans);
    ReleasePpo(&pglsdlfont);

    // Add Comic Sans MS
    stnFontName = "Comic Sans MS";
    AssertDo(FAddFontName(stnFontName.Psz(), &onn, &pglsdlfont), "Could not add system font");

    // Comic Sans MS Bold and Italic
    stnFontPath = "C:\\windows\\fonts\\comicz.ttf";
    AssertDo(fniFont.FBuildFromPath(&stnFontPath), "Could not build path to font");
    AssertDo(psdlfComicSans = SDLFontFile::PSDLFontFileNew(&fniFont, (fontBold | fontItalic)),
             "Could not allocate font");
    pglsdlfont->FAdd(&psdlfComicSans);

    // Comic Sans MS Italic
    stnFontPath = "C:\\windows\\fonts\\comici.ttf";
    AssertDo(fniFont.FBuildFromPath(&stnFontPath), "Could not build path to font");
    AssertDo(psdlfComicSans = SDLFontFile::PSDLFontFileNew(&fniFont, fontItalic), "Could not allocate font");
    pglsdlfont->FAdd(&psdlfComicSans);

    // Comic Sans MS Bold
    stnFontPath = "C:\\windows\\fonts\\comicbd.ttf";
    AssertDo(fniFont.FBuildFromPath(&stnFontPath), "Could not build path to font");
    AssertDo(psdlfComicSans = SDLFontFile::PSDLFontFileNew(&fniFont, fontBold), "Could not allocate font");
    pglsdlfont->FAdd(&psdlfComicSans);

    // Comic Sans MS
    stnFontPath = "C:\\windows\\fonts\\comic.ttf";
    AssertDo(fniFont.FBuildFromPath(&stnFontPath), "Could not build path to font");
    AssertDo(psdlfComicSans = SDLFontFile::PSDLFontFileNew(&fniFont, fontAll), "Could not allocate font");
    pglsdlfont->FAdd(&psdlfComicSans);

    ReleasePpo(&pglsdlfont);

    return fTrue;

LFail:
    ReleasePpo(&psdlfComicSans);
    return fFalse;
}

bool NTL::FAddFontName(PCSZ pcszFontName, int32_t *ponn, PGL *pglsdlfont)
{
    AssertSz(pcszFontName);
    AssertPvCb(ponn, SIZEOF(*ponn));
    AssertPvCb(pglsdlfont, SIZEOF(*pglsdlfont));

    bool fRet = fFalse;
    PGL pgl = pvNil;
    STN stnFontName = pcszFontName;

    // Create list to map a font face to SDL fonts
    if (pvNil == (pgl = GL::PglNew(sizeof(PSDLFont), 0)))
        goto LFail;

    fRet = _pgst->FAddStn(&stnFontName, &pgl, ponn);
    Assert(fRet, "Could not add font to list");
    if (fRet)
    {
        // List is now owned by the GST
        pgl->AddRef();

        // Return a reference to the caller
        pgl->AddRef();
        *pglsdlfont = pgl;
    }

LFail:
    ReleasePpo(&pgl);
    return fRet;
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

    PGL pglsdlfont = pvNil;
    TTF_Font *pttf = pvNil;
    int32_t grfontWanted = 0;

    if (pdsf == pvNil)
        return pvNil;

    // Find the list of SDL fonts for this font face number
    _pgst->GetExtra(pdsf->onn, &pglsdlfont);
    if (pglsdlfont == pvNil)
        return pvNil;

    // Go through the font list twice to find the best match
    // First, try for an exact match of font style flags
    // If not found, try matching the font styles with what the font can do
    grfontWanted = pdsf->grfont;
    for (int32_t cact = 0; cact < 2; cact++)
    {
        for (int32_t ifnt = 0; ifnt < pglsdlfont->IvMac(); ifnt++)
        {
            PSDLFont *ppsdlf = (PSDLFont *)pglsdlfont->QvGet(ifnt);
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

TTF_Font *SDLFont::PttfFont()
{
    // Load the font on first use
    if (_ttfFont == pvNil && !_fLoadFailed)
    {
        _fLoadFailed = fTrue;
        SDL_RWops *rwops = GetFontRWops();
        if (rwops != pvNil)
        {
            _ttfFont = TTF_OpenFontRW(rwops, 1, 0);

            if (_ttfFont != pvNil)
            {
                _fLoadFailed = fFalse;
                // The TTF font object now owns the rwops object
                rwops = pvNil;
            }
            else
            {
                PCSZ pszErr = TTF_GetError();
                Assert(0, pszErr);
                PushErc(ercGfxCantSetFont);
            }

            if (rwops != pvNil)
            {
                SDL_RWclose(rwops);
            }
        }
    }

    return _ttfFont;
}

SDLFont::~SDLFont()
{
    // Free font
    if (_ttfFont != pvNil)
    {
        TTF_CloseFont(_ttfFont);
        _ttfFont = pvNil;
    }
}

PSDLFontFile SDLFontFile::PSDLFontFileNew(PFNI pfniFont, int32_t grffont)
{
    PSDLFontFile psdlf = pvNil;

    if (pvNil == (psdlf = NewObj SDLFontFile))
    {
        PushErc(ercOomNew);
        return pvNil;
    }

    psdlf->_fniFont = *pfniFont;
    psdlf->_grfont = grffont;

    return psdlf;
}

SDL_RWops *SDLFontFile::GetFontRWops()
{
    STN stnFontPath;
    _fniFont.GetStnPath(&stnFontPath);

    SDL_RWops *rwops = SDL_RWFromFile(stnFontPath.Psz(), "rb");
    Assert(rwops != pvNil, "Opening file failed!");
    return rwops;
}

PSDLFontMemory SDLFontMemory::PSDLFontMemoryNew(const uint8_t *pbFont, const int32_t cbFont, int32_t grffont)
{
    PSDLFontMemory psdlf = pvNil;

    if (pvNil == (psdlf = NewObj SDLFontMemory))
    {
        PushErc(ercOomNew);
        return pvNil;
    }

    psdlf->_pbFont = pbFont;
    psdlf->_cbFont = cbFont;
    psdlf->_grfont = grffont;

    return psdlf;
}

SDL_RWops *SDLFontMemory::GetFontRWops()
{
    SDL_RWops *rwops = SDL_RWFromConstMem(_pbFont, _cbFont);
    Assert(rwops != pvNil, "Opening file failed!");
    return rwops;
}