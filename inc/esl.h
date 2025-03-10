/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    esl.h: Easel classes

    Primary Author: ******
    Review Status: REVIEWED - any changes to this file must be reviewed!

    BASE ---> CMH ---> GOB ---> GOK ---> ESL (generic easel)
                                          |
                                          +---> ESLT (text easel)
                                          |
                                          +---> ESLC (costume easel)
                                          |
                                          +---> ESLL (listener easel)
                                          |
                                          +---> ESLR (sound recording easel)

***************************************************************************/
#ifndef ESL_H
#define ESL_H

// Function to build a GCB to construct a child under a parent
bool FBuildGcb(PGCB pgcb, int32_t kidParent, int32_t kidChild);

// Function to set a GOK to a different state
void SetGokState(int32_t kid, int32_t st);

/*****************************
    The generic easel class
*****************************/
typedef class ESL *PESL;
#define ESL_PAR GOK
#define kclsESL KLCONST3('E', 'S', 'L')
class ESL : public ESL_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(ESL)

  protected:
    ESL(PGCB pgcb) : GOK(pgcb)
    {
    }
    bool _FInit(PRCA prca, int32_t kidEasel);
    virtual bool _FAcceptChanges(bool *pfDismissEasel)
    {
        return fTrue;
    }

  public:
    static PESL PeslNew(PRCA prca, int32_t kidParent, int32_t hidEasel);
    ~ESL(void);

    bool FCmdDismiss(PCMD pcmd); // Handles both OK and Cancel
};

typedef class ESLT *PESLT; // SNE needs this
/****************************************
    Spletter Name Editor class.  It's
    derived from EDSL, which is a Kauai
    single-line edit control
****************************************/
typedef class SNE *PSNE;
#define SNE_PAR EDSL
#define kclsSNE KLCONST3('S', 'N', 'E')
class SNE : public SNE_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    PESLT _peslt; // easel to notify when text changes

  protected:
    SNE(PEDPAR pedpar) : EDSL(pedpar)
    {
    }

  public:
    static PSNE PsneNew(PEDPAR pedpar, PESLT peslt, PSTN pstnInit);
    virtual bool FReplace(const achar *prgch, int32_t cchIns, int32_t ich1, int32_t ich2, int32_t gin) override;
};

/****************************************
    The text easel class
****************************************/
typedef class ESLT *PESLT;
#define ESLT_PAR ESL
#define kclsESLT KLCONST4('E', 'S', 'L', 'T')
class ESLT : public ESLT_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(ESLT)

  protected:
    PMVIE _pmvie; // Movie that this TDT is in
    PACTR _pactr; // Actor of this TDT, or pvNil for new TDT
    PAPE _pape;   // Actor Preview Entity
    PSNE _psne;   // Spletter Name Editor
    PRCA _prca;   // Resource source for cursors
    PSFL _psflMtrl;
    PBCL _pbclMtrl;
    PSFL _psflTdf;
    PBCL _pbclTdf;
    PSFL _psflTdts;

  protected:
    ESLT(PGCB pgcb) : ESL(pgcb)
    {
    }
    bool _FInit(PRCA prca, int32_t kidEasel, PMVIE pmvie, PACTR pactr, PSTN pstnNew, int32_t tdtsNew, PTAG ptagTdfNew);
    virtual bool _FAcceptChanges(bool *pfDismissEasel) override;

  public:
    static PESLT PesltNew(PRCA prca, PMVIE pmvie, PACTR pactr, PSTN pstnNew = pvNil, int32_t tdtsNew = tdtsNil,
                          PTAG ptagTdfNew = pvNil);
    ~ESLT(void);

    bool FCmdRotate(PCMD pcmd);
    bool FCmdTransmogrify(PCMD pcmd);
    bool FCmdStartPopup(PCMD pcmd);
    bool FCmdSetFont(PCMD pcmd);
    bool FCmdSetShape(PCMD pcmd);
    bool FCmdSetColor(PCMD pcmd);

    bool FTextChanged(PSTN pstn);
};

/********************************************
    The actor easel (costume changer) class
********************************************/
typedef class ESLA *PESLA;
#define ESLA_PAR ESL
#define kclsESLA KLCONST4('E', 'S', 'L', 'A')
class ESLA : public ESLA_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(ESLA)

  protected:
    PMVIE _pmvie; // Movie that this actor is in
    PACTR _pactr; // The actor that is being edited
    PAPE _pape;   // Actor Preview Entity
    PEDSL _pedsl; // Single-line edit control (for actor's name)

  protected:
    ESLA(PGCB pgcb) : ESL(pgcb)
    {
    }
    bool _FInit(PRCA prca, int32_t kidEasel, PMVIE pmvie, PACTR pactr);
    virtual bool _FAcceptChanges(bool *pfDismissEasel) override;

  public:
    static PESLA PeslaNew(PRCA prca, PMVIE pmvie, PACTR pactr);
    ~ESLA(void);

    bool FCmdRotate(PCMD pcmd);
    bool FCmdTool(PCMD pcmd);
};

/****************************************
    Listener sound class
****************************************/
typedef class LSND *PLSND;
#define LSND_PAR BASE
#define kclsLSND KLCONST4('L', 'S', 'N', 'D')
class LSND : public LSND_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    PGL _pgltag;         // PGL in case of chained sounds
    int32_t _vlm;        // Initial volume
    int32_t _vlmNew;     // User can redefine with slider
    bool _fLoop;         // Looping sound
    int32_t _objID;      // Owner's object ID
    int32_t _sty;        // Sound type
    int32_t _kidVol;     // Kid of volume slider
    int32_t _kidIcon;    // Kid of sound-type icon
    int32_t _kidEditBox; // Kid of sound-name box
    bool _fMatcher;      // Whether this is a motion-matched sound

  public:
    LSND(void)
    {
        _pgltag = pvNil;
    }
    ~LSND(void);

    bool FInit(int32_t sty, int32_t kidVol, int32_t kidIcon, int32_t kidEditBox, PGL *ppgltag, int32_t vlm, bool fLoop,
               int32_t objID, bool fMatcher);
    bool FValidSnd(void);
    void SetVlmNew(int32_t vlmNew)
    {
        _vlmNew = vlmNew;
    }
    void Play(void);
    bool FChanged(int32_t *pvlmNew, bool *pfNuked);
};

/****************************************
    The listener easel class
****************************************/
typedef class ESLL *PESLL;
#define ESLL_PAR ESL
#define kclsESLL KLCONST4('E', 'S', 'L', 'L')
class ESLL : public ESLL_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(ESLL)

  protected:
    PMVIE _pmvie; // Movie that these sounds are in
    PSCEN _pscen; // Scene that these sounds are in
    PACTR _pactr; // Actor that sounds are attached to (or pvNil)
    LSND _lsndSpeech;
    LSND _lsndSfx;
    LSND _lsndMidi;
    LSND _lsndSpeechMM;
    LSND _lsndSfxMM;

  protected:
    ESLL(PGCB pgcb) : ESL(pgcb)
    {
    }

    bool _FInit(PRCA prca, int32_t kidEasel, PMVIE pmvie, PACTR pactr);
    virtual bool _FAcceptChanges(bool *pfDismissEasel) override;

  public:
    static PESLL PesllNew(PRCA prca, PMVIE pmvie, PACTR pactr);
    ~ESLL(void);

    bool FCmdVlm(PCMD pcmd);
    bool FCmdPlay(PCMD pcmd);
};

/****************************************
    The sound recording easel class
****************************************/
typedef class ESLR *PESLR;
#define ESLR_PAR ESL
#define kclsESLR KLCONST4('E', 'S', 'L', 'R')
class ESLR : public ESLR_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(ESLR)

  protected:
    PMVIE _pmvie;         // The movie to insert sound into
    bool _fSpeech;        // Recording Speech or SFX?
    PEDSL _pedsl;         // Single-line edit control for sound name
    PSREC _psrec;         // Sound recording object
    CLOK _clok;           // Clock to limit sound length
    bool _fRecording;     // Are we recording right now?
    bool _fPlaying;       // Are we playing back the recording?
    uint32_t _tsStartRec; // Time at which we started recording

  protected:
    ESLR(PGCB pgcb) : ESL(pgcb), _clok(HidUnique())
    {
    }
    bool _FInit(PRCA prca, int32_t kidEasel, PMVIE pmvie, bool fSpeech, PSTN pstnNew);
    virtual bool _FAcceptChanges(bool *pfDismissEasel) override;
    void _UpdateMeter(void);

  public:
    static PESLR PeslrNew(PRCA prca, PMVIE pmvie, bool fSpeech, PSTN pstnNew);
    ~ESLR(void);

    bool FCmdRecord(PCMD pcmd);
    bool FCmdPlay(PCMD pcmd);
    bool FCmdUpdateMeter(PCMD pcmd);
};

#endif // ESL_H
