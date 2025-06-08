/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    SDL Font management.

***************************************************************************/

#ifndef FONTSDL_H
#define FONTSDL_H

// Bitmask of all supported font styles
#define fontAll (fontBold | fontItalic | fontUnderline | fontBoxed)

typedef class SDLF *PSDLF;

#define SDLF_PAR BASE
#define kclsSDLF KLCONST4('S', 'D', 'L', 'F')

// SDL Font
class SDLF : public SDLF_PAR
{
    RTCLASS_DEC
    NOCOPY(SDLF)

  public:
    virtual ~SDLF() override;

    /**
     * @brief Create a new font object
     *
     * @param fniFont Path to font file
     * @param grffont Font style flags
     * @return SDLF object represented the loaded font
     */
    static PSDLF PsdlfNew(PFNI pfniFont, int32_t grffont);

    /**
     * @brief Get the SDL_TTF font object. This will load the font if not already loaded.
     **/
    TTF_Font *PttfFont();

    /**
     * @brief Return bitmask for supported font styles
     * @return
     */
    int32_t Grfont()
    {
        return _grfont;
    }

  private:
    // Path to font file
    FNI _fniFont;

    // Loaded font
    TTF_Font *_ttfFont = pvNil;

    // fTrue if we failed to load the font
    bool _fLoadFailed = fFalse;

    // Font style flags
    int32_t _grfont = 0;
};

#endif // FONTSDL_H
