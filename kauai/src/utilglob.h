/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    These are globals common to the util layer.

***************************************************************************/
#ifndef UTILGLOB_H
#define UTILGLOB_H

/***************************************************************************
    Universal scalable application clock and other time stuff
***************************************************************************/
const uint32_t kluTimeScaleNormal = 0x00010000;

typedef class USAC *PUSAC;
#define USAC_PAR BASE
#define kclsUSAC KLCONST4('U', 'S', 'A', 'C')
class USAC : public USAC_PAR
{
    RTCLASS_DEC

  private:
    uint32_t _tsBaseSys; // base system time
    uint32_t _tsBaseApp; // base application time
    uint32_t _luScale;

  public:
    USAC(void);

    uint32_t TsCur(void);
    void Scale(uint32_t luScale);
    uint32_t LuScale(void)
    {
        return _luScale;
    }
    void Jump(uint32_t dtsJump)
    {
        _tsBaseApp += dtsJump;
    }
};

extern PUSAC vpusac;

inline uint32_t TsCurrent(void)
{
    return vpusac->TsCur();
}
inline uint32_t DtsCaret(void)
{
#if defined(KAUAI_WIN32)
    return MacWin(GetCaretTime(), GetCaretBlinkTime());
#elif defined(KAUAI_SDL)
    // Return the default caret blink time on Windows
    const uint32_t kdtsCaret = 530; // milliseconds
    return kdtsCaret;
#else
    RawRtn();
    return 0;
#endif
}

/***************************************************************************
    Mutexes to protect various global linked lists, etc.
***************************************************************************/
#ifdef DEBUG
extern MUTX vmutxBase;
#endif // DEBUG
extern MUTX vmutxMem;

/***************************************************************************
    Global random number generator and shuffler. These are used by the
    script interpreter.
***************************************************************************/
extern SFL vsflUtil;
extern RND vrndUtil;

/***************************************************************************
    Global standard Kauai codec, compression manager, and pointer to
    a compression manager. The blck-level compression uses vpcodmUtil.
    Clients are free to redirect this to their own compression manager.
***************************************************************************/
extern KCDC vkcdcUtil;
extern CODM vcodmUtil;
extern PCODM vpcodmUtil;

/***************************************************************************
    Debug memory globals
***************************************************************************/
#ifdef DEBUG
extern DMGLOB vdmglob;
#endif // DEBUG

#endif //! UTILGLOB_H
