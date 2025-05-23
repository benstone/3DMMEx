/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Kidspace class declarations

***************************************************************************/
#ifndef KIDSPACE_H
#define KIDSPACE_H

#define ChidFromSnoDchid(sno, dchid) LwHighLow((int16_t)(sno), (int16_t)(dchid))

/***************************************************************************
    Graphical object representation.  A bitmap, fill, tiled bitmap, etc.
***************************************************************************/
typedef class GORP *PGORP;
#define GORP_PAR BASE
#define kclsGORP KLCONST4('G', 'O', 'R', 'P')
class GORP : public GORP_PAR
{
    RTCLASS_DEC

  protected:
    GORP(void)
    {
    }

  public:
    virtual void Draw(PGNV pgnv, RC *prcClip) = 0;
    virtual bool FPtIn(int32_t xp, int32_t yp) = 0;
    virtual void SetDxpDyp(int32_t dxpPref, int32_t dypPref) = 0;
    virtual void GetRc(RC *prc) = 0;
    virtual void GetRcContent(RC *prc) = 0;

    virtual int32_t NfrMac(void);
    virtual int32_t NfrCur(void);
    virtual void GotoNfr(int32_t nfr);
    virtual bool FPlaying(void);
    virtual bool FPlay(void);
    virtual void Stop(void);
    virtual void Suspend(void);
    virtual void Resume(void);
    virtual void Stream(bool fStream);
};

/***************************************************************************
    Graphical object fill representation.
***************************************************************************/
typedef class GORF *PGORF;
#define GORF_PAR GORP
#define kclsGORF KLCONST4('G', 'O', 'R', 'F')
class GORF : public GORF_PAR
{
    RTCLASS_DEC

  protected:
    ACR _acrFore;
    ACR _acrBack;
    APT _apt;
    RC _rc;
    int32_t _dxp;
    int32_t _dyp;

  public:
    static PGORF PgorfNew(PGOK pgok, PCRF pcrf, CTG ctg, CNO cno);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FPtIn(int32_t xp, int32_t yp) override;
    virtual void SetDxpDyp(int32_t dxpPref, int32_t dypPref) override;
    virtual void GetRc(RC *prc) override;
    virtual void GetRcContent(RC *prc) override;
};

/***************************************************************************
    Graphical object bitmap representation.
***************************************************************************/
typedef class GORB *PGORB;
#define GORB_PAR GORP
#define kclsGORB KLCONST4('G', 'O', 'R', 'B')
class GORB : public GORB_PAR
{
    RTCLASS_DEC

  protected:
    PCRF _pcrf;
    CTG _ctg;
    CNO _cno;
    bool _fStream;

    ~GORB(void);

  public:
    static PGORB PgorbNew(PGOK pgok, PCRF pcrf, CTG ctg, CNO cno);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FPtIn(int32_t xp, int32_t yp) override;
    virtual void SetDxpDyp(int32_t dxpPref, int32_t dypPref) override;
    virtual void GetRc(RC *prc) override;
    virtual void GetRcContent(RC *prc) override;
    virtual void Stream(bool fStream) override;
};

/***************************************************************************
    Graphical object tiled bitmap representation.
***************************************************************************/
enum
{
    idzpLeftBorder,
    idzpRightBorder,
    idzpLeft,
    idzpLeftFlex,
    idzpLeftInc,
    idzpMid,
    idzpRightFlex,
    idzpRightInc,
    idzpRight,
    idzpLimGort
};

typedef class GORT *PGORT;
#define GORT_PAR GORP
#define kclsGORT KLCONST4('G', 'O', 'R', 'T')
class GORT : public GORT_PAR
{
    RTCLASS_DEC

  protected:
    // a TILE chunk
    struct GOTIL
    {
        int16_t bo;
        int16_t osk;
        int16_t rgdxp[idzpLimGort];
        int16_t rgdyp[idzpLimGort];
    };

    PCRF _pcrf;
    CTG _ctg;
    CNO _cno;
    int16_t _rgdxp[idzpLimGort];
    int16_t _rgdyp[idzpLimGort];

    int32_t _dxpLeftFlex;
    int32_t _dxpRightFlex;
    int32_t _dypLeftFlex;
    int32_t _dypRightFlex;
    int32_t _dxp; // the total width
    int32_t _dyp; // the total height

    bool _fStream;

    ~GORT(void);
    void _DrawRow(PGNV pgnv, PMBMP pmbmp, RC *prcRow, RC *prcClip, int32_t dxp, int32_t dyp);
    void _ComputeFlexZp(int32_t *pdzpLeftFlex, int32_t *pdzpRightFlex, int32_t dzp, int16_t *prgdzp);
    void _MapZpToMbmp(int32_t *pzp, int16_t *prgdzp, int32_t dzpLeftFlex, int32_t dzpRightFlex);
    void _MapZpFlex(int32_t *pzp, int16_t *prgdzp, int32_t dzpLeftFlex, int32_t dzpRightFlex);

  public:
    static PGORT PgortNew(PGOK pgok, PCRF pcrf, CTG ctg, CNO cno);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FPtIn(int32_t xp, int32_t yp) override;
    virtual void SetDxpDyp(int32_t dxpPref, int32_t dypPref) override;
    virtual void GetRc(RC *prc) override;
    virtual void GetRcContent(RC *prc) override;
    virtual void Stream(bool fStream) override;
};

/***************************************************************************
    Graphical object video representation.
***************************************************************************/
typedef class GORV *PGORV;
#define GORV_PAR GORP
#define kclsGORV KLCONST4('G', 'O', 'R', 'V')
class GORV : public GORV_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    PGVID _pgvid;
    int32_t _dxp;
    int32_t _dyp;
    int32_t _cactSuspend;
    bool _fHwndBased : 1;
    bool _fPlayOnResume : 1;

    ~GORV(void);

    virtual bool _FInit(PGOK pgok, PCRF pcrf, CTG ctg, CNO cno);

  public:
    static PGORV PgorvNew(PGOK pgok, PCRF pcrf, CTG ctg, CNO cno);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FPtIn(int32_t xp, int32_t yp) override;
    virtual void SetDxpDyp(int32_t dxpPref, int32_t dypPref) override;
    virtual void GetRc(RC *prc) override;
    virtual void GetRcContent(RC *prc) override;

    virtual int32_t NfrMac(void) override;
    virtual int32_t NfrCur(void) override;
    virtual void GotoNfr(int32_t nfr) override;
    virtual bool FPlaying(void) override;
    virtual bool FPlay(void) override;
    virtual void Stop(void) override;
    virtual void Suspend(void) override;
    virtual void Resume(void) override;
};

/***************************************************************************
    These are the mouse tracking states for kidspace gobs. gmsNil is an
    illegal state used in the tables to signal that we should assert.

    In the lists below, tracking indicates that when in the state, we are
    tracking the mouse. These are static states:

        kgmsIdle (mouse is not over us, _not_ tracking)
        kgmsOn (mouse is over us, _not_ tracking)
        kgmsDownOn (mouse is over us, tracking)
        kgmsDownOff (mouse isn't over us, tracking)

    These are auto-advance states (only animations are allowed):

        kgmsEnterState (entering the state, _not_ tracking)
        kgmsRollOn (mouse rolled onto us, _not_ tracking)
        kgmsRollOff (mouse rolled off of us, _not_ tracking)
        kgmsPressOn (mouse down on us, tracking)
        kgmsReleaseOn (mouse up on us, tracking)
        kgmsDragOff (mouse rolled off us, tracking)
        kgmsDragOn (mouse rolled on us, tracking)
        kgmsReleaseOff (mouse was released off us, _not_ tracking)

    There is one special state: kgmsWait (tracking). This indicates that
    we've completed a kgmsReleaseOn and are waiting for a cidClicked command
    or a cidTrackMouse command to come through. If the former comes through,
    we handle the click, stop tracking and advance to kgmsOn. If the latter,
    the cidClicked was filtered out by someone else, so we stop tracking and
    goto kgmsOn.

***************************************************************************/
enum
{
    gmsNil,

    // non-tracking states
    kgmsEnterState,
    kgmsIdle,
    kgmsRollOn,
    kgmsRollOff,
    kgmsOn,
    kgmsReleaseOff,

    // tracking states
    kgmsMinTrack,
    kgmsPressOn = kgmsMinTrack,
    kgmsReleaseOn,
    kgmsDownOn,
    kgmsDragOff,
    kgmsDragOn,
    kgmsDownOff,
    kgmsWait,
    kgmsLimTrack,

    kgmsLim = kgmsLimTrack
};

/***************************************************************************
    Graphic Object in Kidspace.  Because of script invocation, the GOK
    may be destroyed in just about every method of the GOK.  So most methods
    return a boolean indicating whether the GOK still exists.
***************************************************************************/
enum
{
    fgokNil = 0,
    fgokKillAnim = 1,   // kill current animation
    fgokNoAnim = 2,     // don't launch an animation
    fgokReset = 4,      // if the current rep is requested, totally reset it
    fgokMouseSound = 8, // set the mouse sound as well
};

typedef class GOK *PGOK;
#define GOK_PAR GOB
#define kclsGOK KLCONST3('G', 'O', 'K')
class GOK : public GOK_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(GOK)

  protected:
    int32_t _dxp; // offset from top-left to the registration point
    int32_t _dyp;
    int32_t _zp; // z-coord (for placing GOK's relative to this one)

    int32_t _dxpPref; // preferred size (if non-zero)
    int32_t _dypPref;

    PWOKS _pwoks; // the kidspace world that this GOK belongs to
    PRCA _prca;   // Chunky resource chain
    PCRF _pcrf;   // Chunky resource file

    int16_t _sno;       // state number
    int16_t _cactMouse; // mouse click count of last mouse down
    uint32_t _grfcust;  // cursor state at last mouse down
    int32_t _gmsCur;    // gob mouse tracking state

    bool _fRect : 1;          // whether to use rectangular hit testing exclusively
    bool _fNoHit : 1;         // invisible to the mouse
    bool _fNoHitKids : 1;     // children of this GOK are invisible to the mouse
    bool _fNoSlip : 1;        // animations shouldn't slip
    bool _fGorpDirty : 1;     // whether the GORP changed while deferred
    bool _fMouseSndDirty : 1; // whether playing the mouse sound was deferred
    bool _fStream : 1;        // once we switch reps, we won't use this one again

    int32_t _cactDeferGorp; // defer marking and positioning the gorp
    PGORP _pgorp;           // the graphical representation
    CKI _ckiGorp;           // cki of the current gorp

    int32_t _dtim;    // current time increment for animation
    PSCEG _pscegAnim; // animation script
    CHID _chidAnim;   // chid of current animation

    PGOKD _pgokd;

    int32_t _siiSound;     // sound to kill when we go away
    int32_t _siiMouse;     // mouse tracking sound - kill it when we go away
    CKI _ckiMouseSnd;      // for deferred playing of the mouse sound
    int32_t _cactDeferSnd; // defer starting the mouse sound if this is > 0

    // cid/hid filtering
    struct CMFLT
    {
        int32_t cid;
        int32_t hid;
        CHID chidScript;
    };
    PGL _pglcmflt; // list of cmd filtering structs, sorted by cid

    int32_t _hidToolTipSrc; // get the tool tip info from this GOK

    GOK(GCB *pgcb);
    ~GOK(void);

    static PGOB _PgobBefore(PGOB pgobPar, int32_t zp);

    virtual bool _FInit(PWOKS pwoks, PGOKD pgokd, PRCA prca);
    virtual bool _FInit(PWOKS pwoks, CNO cno, PRCA prca);

    virtual bool _FAdjustGms(struct GMSE *pmpgmsgmse);
    virtual bool _FSetGmsCore(int32_t gms, uint32_t grfact, bool *pfStable);
    virtual bool _FSetGms(int32_t gms, uint32_t grfact);

    virtual bool _FEnterState(int32_t sno);
    virtual bool _FSetRep(CHID chid, uint32_t grfgok = fgokKillAnim, CTG ctg = ctgNil, int32_t dxp = 0, int32_t dyp = 0,
                          bool *pfSet = pvNil);
    virtual bool _FAdvanceFrame(void);

    virtual void _SetGorp(PGORP pgorp, int32_t dxp, int32_t dyp);
    virtual PGORP _PgorpNew(PCRF pcrf, CTG ctg, CNO cno);

    bool _FFindCmflt(int32_t cid, int32_t hid, CMFLT *pcmflt = pvNil, int32_t *picmflt = pvNil);
    bool _FFilterCmd(PCMD pcmd, CHID chidScript, bool *pfFilter);
    void _PlayMouseSound(CHID chid);
    CNO _CnoToolTip(void);
    CHID _ChidMouse(void);
    void _DeferGorp(bool fDefer);
    void _DeferSnd(bool fDefer);

  public:
    static PGOK PgokNew(PWOKS pwoks, PGOB pgobPar, int32_t hid, PGOKD pgokd, PRCA prca);

    PWOKS Pwoks(void)
    {
        return _pwoks;
    }
    int32_t Sno(void)
    {
        return _sno;
    }
    void GetPtReg(PT *ppt, int32_t coo = cooParent);
    void GetRcContent(RC *prc);
    int32_t ZPlane(void)
    {
        return _zp;
    }
    void SetZPlane(int32_t zp);
    void SetNoSlip(bool fNoSlip);
    void SetHidToolTip(int32_t hidSrc);

    virtual void SetCursor(uint32_t grfcust);
    virtual bool FPtIn(int32_t xp, int32_t yp) override;
    virtual bool FPtInBounds(int32_t xp, int32_t yp) override;
    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FCmdTrackMouse(PCMD_MOUSE pcmd) override;
    virtual bool FCmdAlarm(PCMD pcmd);
    virtual bool FCmdMouseMove(PCMD_MOUSE pcmd) override;
    virtual bool FCmdClicked(PCMD_MOUSE pcmd);
    bool FCmdClickedCore(PCMD pcmd)
    {
        return FCmdClicked((PCMD_MOUSE)pcmd);
    }
    virtual bool FCmdAll(PCMD pcmd);
    virtual bool FFilterCidHid(int32_t cid, int32_t hid, CHID chidScript);

    virtual bool FEnsureToolTip(PGOB *ppgobCurTip, int32_t xpMouse, int32_t ypMouse) override;
    virtual int32_t LwState(void) override;

    virtual bool FRunScript(CHID chid, int32_t *prglw = pvNil, int32_t clw = 0, int32_t *plwReturn = pvNil,
                            tribool *ptSuccess = pvNil);
    virtual bool FRunScriptCno(CNO cno, int32_t *prglw = pvNil, int32_t clw = 0, int32_t *plwReturn = pvNil,
                               tribool *ptSuccess = pvNil);
    virtual bool FChangeState(int32_t sno);
    virtual bool FSetRep(CHID chid, uint32_t grfgok = fgokKillAnim, CTG ctg = ctgNil, int32_t dxp = 0, int32_t dyp = 0,
                         uint32_t dtim = 0);

    virtual bool FPlay(void);
    virtual bool FPlaying(void);
    virtual void Stop(void);
    virtual void GotoNfr(int32_t nfr);
    virtual int32_t NfrMac(void);
    virtual int32_t NfrCur(void);

    virtual int32_t SiiPlaySound(CTG ctg, CNO cno, int32_t sqn, int32_t vlm, int32_t cactPlay, uint32_t dtsStart,
                                 int32_t spr, int32_t scl);
    virtual int32_t SiiPlayMouseSound(CTG ctg, CNO cno);

    virtual void Suspend(void);
    virtual void Resume(void);
    virtual void Stream(bool fStream);
};

#endif //! KIDSPACE_H
