/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Cursor class.

***************************************************************************/
#ifndef CURSOR_H
#define CURSOR_H

enum
{
    curtMonochrome = 0,
};

// cursor on file - stored in a GG with the rgb's in the variable part
struct CURF
{
    int32_t curt; // type of cursor
    uint8_t xp;   // hot spot
    uint8_t yp;
    uint8_t dxp; // size - either 16 or 32 and they should match
    uint8_t dyp;
    // uint8_t rgbAnd[];
    // uint8_t rgbXor[];
};
VERIFY_STRUCT_SIZE(CURF, 8);
const BOM kbomCurf = 0xC0000000;

typedef class CURS *PCURS;
#define CURS_PAR BACO
#define kclsCURS KLCONST4('C', 'U', 'R', 'S')
class CURS : public CURS_PAR
{
    RTCLASS_DEC

  private:
  protected:
#ifdef KAUAI_WIN32
    HCRS _hcrs;
#endif // KAUAI_WIN32
#ifdef MAC
    Cursor _crs;
#endif // MAC
#ifdef KAUAI_SDL
    SDL_Cursor *_crs;
#endif // KAUAI_SDL

    CURS(void)
    {
    } // we have to be allocated
    ~CURS(void);

  public:
    static bool FReadCurs(PCRF pcrf, CTG ctg, CNO cno, BLCK *pblck, PBACO *ppbaco, int32_t *pcb);

    void Set(void);
};

#endif //! CURSOR_H
