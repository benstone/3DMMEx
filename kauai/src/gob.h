/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Graphic object class.

***************************************************************************/
#ifndef GOB_H
#define GOB_H

enum
{
    fgobNil = 0,
    fgobSibling = 1,    // for Constructors
    fgobEnsureHwnd = 2, // for FInitScreen
    fgobNoVis = 0,      // for DrawTree
    fgobAutoVis = 4,    // for DrawTree
    fgobUseVis = 8,     // for DrawTree
};

// GOB invalidation types
enum
{
    ginNil,
    kginDraw,
    kginMark,
    kginSysInval,
    kginDefault
};

const int32_t krelOne = 0x00010000L; // denominator for relative rectangles
const int32_t krelZero = 0;

#ifdef MAC
inline void GetClientRect(HWND hwnd, RCS *prcs)
{
    *prcs = hwnd->port.portRect;
}
inline void InvalHwndRcs(HWND hwnd, RCS *prcs)
{
    PPRT pprt;

    GetPort(&pprt);
    SetPort(&hwnd->port);
    InvalRect(prcs);
    SetPort(pprt);
}
inline void ValidHwndRcs(HWND hwnd, RCS *prcs)
{
    PPRT pprt;

    GetPort(&pprt);
    SetPort(&hwnd->port);
    ValidRect(prcs);
    SetPort(pprt);
}
#endif // MAC
#ifdef WIN
inline void InvalHwndRcs(HWND hwnd, RCS *prcs)
{
    InvalidateRect(hwnd, prcs, fFalse);
}
inline void ValidHwndRcs(HWND hwnd, RCS *prcs)
{
    ValidateRect(hwnd, prcs);
}
#endif // WIN

// coordinates
enum
{
    cooLocal,  // top-left is (0,0)
    cooParent, // relative to parent
    cooGpt,    // relative to the UI port
    cooHwnd,   // relative to the enclosing hwnd
    cooGlobal, // global coordinates
    cooLim
};

/****************************************
    GOB creation block
****************************************/
struct GCB
{
    int32_t _hid;
    PGOB _pgob;
    uint32_t _grfgob;
    int32_t _gin;
    RC _rcAbs;
    RC _rcRel;

    GCB(void)
    {
    }
    GCB(int32_t hid, PGOB pgob, uint32_t grfgob = fgobNil, int32_t gin = kginDefault, RC *prcAbs = pvNil,
        RC *prcRel = pvNil)
    {
        Set(hid, pgob, grfgob, gin, prcAbs, prcRel);
    }
    void Set(int32_t hid, PGOB pgob, uint32_t grfgob = fgobNil, int32_t gin = kginDefault, RC *prcAbs = pvNil,
             RC *prcRel = pvNil);
};
typedef GCB *PGCB;

/****************************************
    Graphics object
****************************************/
#define GOB_PAR CMH
#define kclsGOB KLCONST3('G', 'O', 'B')
class GOB : public GOB_PAR
{
    RTCLASS_DEC
    CMD_MAP_DEC(GOB)
    ASSERT
    MARKMEM

    friend class GTE;

  private:
    static PGOB _pgobScreen;

    KWND _hwnd;   // the OS window (may be nil)
    PGPT _pgpt;   // the graphics port (may be shared with _pgobPar)
    PCURS _pcurs; // the cursor to show over this gob

    RC _rcCur; // current position
    RC _rcVis; // current visible rectangle (in its parent)
    RC _rcAbs; //_rcAbs and _rcRel describe the position of this
    RC _rcRel; // gob in its parent.

    // tree management
    PGOB _pgobPar;
    PGOB _pgobChd;
    PGOB _pgobSib;

    // variables
    PGL _pglrtvm;

    void _SetRcCur(void);
    KWND _HwndGetDptFromCoo(PT *pdpt, int32_t coo);

  protected:
    static int32_t _ginDefGob;
    static int32_t _gridLast;

    int32_t _grid;
    int32_t _ginDefault : 8;
    int32_t _fFreeing : 1;
    int32_t _fCreating : 1;

    ~GOB(void);

    static KWND _HwndNewMdi(PSTN pstnTitle);
    static void _DestroyHwnd(KWND hwnd);

    void _Init(PGCB pgcb);
    KWND _HwndGetRc(RC *prc);
    virtual void _NewRc(void)
    {
    }
    virtual void _ActivateHwnd(bool fActive)
    {
    }

  public:
    static bool FInitScreen(uint32_t grfgob, int32_t ginDef);
    static void ShutDown(void);
    static PGOB PgobScreen(void)
    {
        return _pgobScreen;
    }
    static PGOB PgobFromHwnd(KWND hwnd);
    static PGOB PgobFromClsScr(int32_t cls);
    static PGOB PgobFromHidScr(int32_t hid);
    static void MakeHwndActive(KWND hwnd);
    static void ActivateHwnd(KWND hwnd, bool fActive);
    static KWND HwndMdiActive(void);
    static PGOB PgobMdiActive(void);
    static PGOB PgobFromPtGlobal(int32_t xp, int32_t yp, PT *pptLocal = pvNil);
    static int32_t GinDefault(void)
    {
        return _ginDefGob;
    }

    GOB(GCB *pgcb);
    GOB(int32_t hid);
    virtual void Release(void) override;

    // hwnd stuff
    bool FAttachHwnd(KWND hwnd);
    bool FCreateAndAttachMdi(PSTN pstnTitle);
    KWND Hwnd(void)
    {
        return _hwnd;
    }
    KWND HwndContainer(void);
    virtual void GetMinMax(RC *prcMinMax);
    void SetHwndName(PSTN pstn);

    // unique gob run-time id.
    int32_t Grid(void)
    {
        return _grid;
    }

    // tree management
    PGOB PgobPar(void)
    {
        return _pgobPar;
    }
    PGOB PgobFirstChild(void)
    {
        return _pgobChd;
    }
    PGOB PgobLastChild(void);
    PGOB PgobNextSib(void)
    {
        return _pgobSib;
    }
    PGOB PgobPrevSib(void);
    PGOB PgobFromCls(int32_t cls);
    PGOB PgobChildFromCls(int32_t cls);
    PGOB PgobParFromCls(int32_t cls);
    PGOB PgobFromHid(int32_t hid);
    PGOB PgobChildFromHid(int32_t hid);
    PGOB PgobParFromHid(int32_t hid);
    PGOB PgobFromGrid(int32_t grid);
    void BringToFront(void);
    void SendBehind(PGOB pgobBefore);

    // rectangle management
    void SetPos(RC *prcAbs, RC *prcRel = pvNil);
    void GetPos(RC *prcAbs, RC *prcRel);
    void GetRc(RC *prc, int32_t coo);
    void GetRcVis(RC *prc, int32_t coo);
    void SetRcFromHwnd(void);
    virtual void Maximize(void);

    void MapPt(PT *ppt, int32_t cooSrc, int32_t cooDst);
    void MapRc(RC *prc, int32_t cooSrc, int32_t cooDst);

    // variables
    virtual PGL *Ppglrtvm(void);

    PGPT Pgpt(void)
    {
        return _pgpt;
    }
    void InvalRc(RC *prc, int32_t gin = kginDefault);
    void ValidRc(RC *prc, int32_t gin = kginDefault);
    bool FGetRcInval(RC *prc, int32_t gin = kginDefault);
    void Scroll(RC *prc, int32_t dxp, int32_t dyp, int32_t gin, RC *prcBad1 = pvNil, RC *prcBad2 = pvNil);

    virtual void Clean(void);
    virtual void DrawTree(PGPT pgpt, RC *prc, RC *prcUpdate, uint32_t grfgob);
    virtual void DrawTreeRgn(PGPT pgpt, RC *prc, REGN *pregn, uint32_t grfgob);
    virtual void Draw(PGNV pgnv, RC *prcClip);

    // mouse handling and hit testing
    void GetPtMouse(PT *ppt, bool *pfDown);
    virtual PGOB PgobFromPt(int32_t xp, int32_t yp, PT *pptLocal = pvNil);
    virtual bool FPtIn(int32_t xp, int32_t yp);
    virtual bool FPtInBounds(int32_t xp, int32_t yp);
    virtual void MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust);
    virtual int32_t ZpDragRc(RC *prc, bool fVert, int32_t zp, int32_t zpMin, int32_t zpLim, int32_t zpMinActive,
                             int32_t zpLimActive);
    void SetCurs(PCURS pcurs);
    void SetCursCno(PRCA prca, CNO cno);

#ifdef MAC
    virtual void TrackGrow(PEVT pevt);
#endif // MAC

    // command functions
    virtual bool FCmdCloseWnd(PCMD pcmd);
    virtual bool FCmdTrackMouse(PCMD_MOUSE pcmd);
    bool FCmdTrackMouseCore(PCMD pcmd)
    {
        return FCmdTrackMouse((PCMD_MOUSE)pcmd);
    }
    virtual bool FCmdMouseMove(PCMD_MOUSE pcmd);
    bool FCmdMouseMoveCore(PCMD pcmd)
    {
        return FCmdMouseMove((PCMD_MOUSE)pcmd);
    }

    // key commands
    virtual bool FCmdKey(PCMD_KEY pcmd);
    bool FCmdKeyCore(PCMD pcmd)
    {
        return FCmdKey((PCMD_KEY)pcmd);
    }
    virtual bool FCmdBadKey(PCMD_BADKEY pcmd);
    bool FCmdBadKeyCore(PCMD pcmd)
    {
        return FCmdBadKey((PCMD_BADKEY)pcmd);
    }
    virtual bool FCmdSelIdle(PCMD pcmd);
    virtual bool FCmdActivateSel(PCMD pcmd);

    // tool tips
    virtual bool FEnsureToolTip(PGOB *ppgobCurTip, int32_t xpMouse, int32_t ypMouse);

    // gob state (for automated testing)
    virtual int32_t LwState(void);

#ifdef DEBUG
    void MarkGobTree(void);
#endif // DEBUG
};

/****************************************
    Gob Tree Enumerator
****************************************/
enum
{
    // inputs
    fgteNil = 0x0000,
    fgteSkipToSib = 0x0001,   // legal to FNextGob
    fgteBackToFront = 0x0002, // legal to Init

    // outputs
    fgtePre = 0x0010,
    fgtePost = 0x0020,
    fgteRoot = 0x0040
};

#define GTE_PAR BASE
#define kclsGTE KLCONST3('G', 'T', 'E')
class GTE : public GTE_PAR
{
    RTCLASS_DEC
    ASSERT

  private:
    // enumeration states
    enum
    {
        esStart,
        esGoDown,
        esGoRight,
        esDone
    };

    int32_t _es;
    bool _fBackWards; // which way to walk sibling lists
    PGOB _pgobRoot;
    PGOB _pgobCur;

  public:
    GTE(void);
    void Init(PGOB pgob, uint32_t grfgte);
    bool FNextGob(PGOB *ppgob, uint32_t *pgrfgteOut, uint32_t grfgteIn);
};

#endif //! GOB_H
