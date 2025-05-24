/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    SDL Font management.

***************************************************************************/

#ifndef FONTSDL_H
#define FONTSDL_H

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
     * @return SDLF object represented the loaded font
     */
    static PSDLF PsdlfNew(PFNI pfniFont);

    /**
     * @brief Get the SDL_TTF font object. This will load the font if not already loaded.
     **/
    TTF_Font *PttfFont();

  private:
    // Path to font file
    FNI _fniFont;

    // Loaded font
    TTF_Font *_ttfFont = pvNil;

    // fTrue if we failed to load the font
    bool _fLoadFailed = fFalse;
};

#endif // FONTSDL_H
