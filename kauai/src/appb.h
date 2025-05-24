/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    The base application class.  Most apps will need to subclass this.

***************************************************************************/
#ifndef APPB_H
#define APPB_H

/***************************************************************************
    Misc types
***************************************************************************/
#ifdef WIN
typedef MSG EVT;
#endif // WIN
#ifdef MAC
typedef EventRecord EVT;
#endif // WIN
typedef EVT *PEVT;

#ifdef WIN
// windows specific globals
struct WIG
{
    HINSTANCE hinst;
    HINSTANCE hinstPrev;
    LPTSTR pszCmdLine;
    int wShow;

    KWND hwndApp;
    HDC hdcApp;
    KWND hwndClient;      // MDI client window
    HACCEL haccel;        // main accelerator table
    KWND hwndNextViewer;  // next clipboard viewer
    int32_t lwThreadMain; // main thread
};
extern WIG vwig;
#endif // WIN

/***************************************************************************
    The base application class.
***************************************************************************/
const int32_t kcmhlAppb = klwMax; // appb goes at the end of the cmh list

enum
{
    fappNil = 0x0,
    fappOffscreen = 0x1,
    fappOnscreen = 0x2,
    fappStereoSound = 0x4,
};

typedef class APPB *PAPPB;
#define APPB_PAR CMH
#define kclsAPPB KLCONST4('A', 'P', 'P', 'B')
class APPB : public APPB_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(APPB)

  protected:
    // marked region - for fast updating
    struct MKRGN
    {
        KWND hwnd;
        PREGN pregn;
    };

    // map from a property id to its value
    struct PROP
    {
        int32_t prid;
        int32_t lw;
    };

    // modal context
    struct MODCX
    {
        int32_t cactLongOp;
        PCEX pcex;
        PUSAC pusac;
        uint32_t luScale;
    };

#ifdef DEBUG
    bool _fCheckForLostMem : 1; // whether to check for lost mem at idle
    bool _fInAssert : 1;        // whether we're in an assert
    bool _fRefresh : 1;         // whether to refresh the entire display
#endif                          // DEBUG
    bool _fQuit : 1;            // whether we're in the process of quitting
    bool _fOffscreen : 1;       // whether to do offscreen updates by default
    bool _fFullScreen : 1;      // when maximized, we hide the caption, etc
    bool _fToolTip : 1;         // whether we're in tool-tip mode
    bool _fForeground : 1;      // whether we're the foreground app
    bool _fEndModal : 1;        // set to end the topmost modal loop
    bool _fFlushCursor : 1;     // flush cursor events when setting cursor position

    PGL _pglmkrgn;           // list of marked regions for fast updating
    int32_t _onnDefFixed;    // default fixed pitch font
    int32_t _onnDefVariable; // default variable pitched font
    PGPT _pgptOff;           // cached offscreen GPT for offscreen updates
    int32_t _dxpOff;         // size of the offscreen GPT
    int32_t _dypOff;

    int32_t _xpMouse; // location of mouse on last reported mouse move
    int32_t _ypMouse;
    PGOB _pgobMouse;        // gob mouse was last over
    uint32_t _grfcustMouse; // cursor state on last mouse move

    // for determining the multiplicity of a click
    int32_t _tsMouse;   // time of last mouse click
    int32_t _cactMouse; // multiplicity of last mouse click

    // for tool tips
    uint32_t _tsMouseEnter;  // when the mouse entered _pgobMouse
    uint32_t _dtsToolTip;    // time lag for tool tip
    PGOB _pgobToolTipTarget; // if there is a tool tip up, it's for this gob

    PCURS _pcurs;        // current cursor
    PCURS _pcursWait;    // cursor to use for long operations
    int32_t _cactLongOp; // long operation count
    uint32_t _grfcust;   // current cursor state

    int32_t _gft;     // transition to apply during next fast update
    int32_t _lwGft;   // parameter for transition
    uint32_t _dtsGft; // how much time to give the transition
    PGL _pglclr;      // palette to transition to
    ACR _acr;         // intermediate color to transition to

    PGL _pglprop; // the properties

    PGL _pglmodcx;      // The modal context stack
    int32_t _lwModal;   // Return value from modal loop
    int32_t _cactModal; // how deep we are in application loops

    // initialization, running and clean up
    virtual bool _FInit(uint32_t grfapp, uint32_t grfgob, int32_t ginDef);
#ifdef DEBUG
    virtual bool _FInitDebug(void);
#endif // DEBUG
    virtual bool _FInitOS(void);
    virtual bool _FInitMenu(void);
    virtual void _Loop(void);
    virtual void _CleanUp(void);
    virtual bool _FInitSound(int32_t wav);

    // event fetching and dispatching
    virtual bool _FGetNextEvt(PEVT pevt);
    virtual void _DispatchEvt(PEVT pevt);
    virtual bool _FTranslateKeyEvt(EVT *pevt, PCMD_KEY pcmd);

#ifdef MAC
    // event handlers
    virtual void _MouseDownEvt(EVT *pevt);
    virtual void _MouseUpEvt(EVT *pevt);
    virtual void _UpdateEvt(EVT *pevt);
    virtual void _ActivateEvt(EVT *pevt);
    virtual void _DiskEvt(EVT *pevt);
    virtual void _ActivateApp(EVT *pevt);
    virtual void _DeactivateApp(EVT *pevt);
    virtual void _MouseMovedEvt(EVT *pevt);
#endif

    // fast updating
    virtual void _FastUpdate(PGOB pgob, PREGN pregnClip, uint32_t grfapp = fappNil, PGPT pgpt = pvNil);
    virtual void _CopyPixels(PGNV pgvnSrc, RC *prcSrc, PGNV pgnvDst, RC *prcDst);
    void _MarkRegnRc(PREGN pregn, RC *prc, PGOB pgobCoo);
    void _UnmarkRegnRc(PREGN pregn, RC *prc, PGOB pgobCoo);

    // to borrow the common offscreen GPT
    virtual PGPT _PgptEnsure(RC *prc);

    // property list management
    bool _FFindProp(int32_t prid, PROP *pprop, int32_t *piprop = pvNil);
    bool _FSetProp(int32_t prid, int32_t lw);

    // tool tip support
    void _TakeDownToolTip(void);
    void _EnsureToolTip(void);

// window procs
#ifdef KAUAI_WIN32
    static LRESULT CALLBACK _LuWndProc(HWND hwnd, UINT wm, WPARAM wParam, LPARAM lParam);
    static LRESULT CALLBACK _LuMdiWndProc(HWND hwnd, UINT wm, WPARAM wParam, LPARAM lParam);

    virtual bool _FFrameWndProc(HWND hwnd, UINT wm, WPARAM wParam, LPARAM lw, int32_t *plwRet);
    virtual bool _FMdiWndProc(HWND hwnd, UINT wm, WPARAM wParam, LPARAM lw, int32_t *plwRet);
    virtual bool _FCommonWndProc(HWND hwnd, UINT wm, WPARAM wParam, LPARAM lw, int32_t *plwRet);

    // remove ourself from the clipboard viewer chain
    void _ShutDownViewer(void);
#endif // KAUAI_WIN32

    // Activation
    virtual void _Activate(bool fActive);

  public:
    APPB(void);
    ~APPB(void);

#ifdef MAC
    // setting up the heap
    static void _SetupHeap(int32_t cbExtraStack, int32_t cactMoreMasters);
    virtual void SetupHeap(void);
#elif defined(WIN)
    static void CreateConsole();
#endif

    bool FQuitting(void)
    {
        return _fQuit;
    }
    bool FForeground(void)
    {
        return _fForeground;
    }

    // initialization, running and quitting
    virtual void Run(uint32_t grfapp, uint32_t grfgob, int32_t ginDef);
    virtual void Quit(bool fForce);
    virtual void Abort(void);
    virtual void TopOfLoop(void);

    // look for the next key event in the system event queue
    virtual bool FGetNextKeyFromOsQueue(PCMD_KEY pcmd);

    // Look for mouse events and get the mouse location
    // GrfcustCur() is synchronized with this
    void TrackMouse(PGOB pgob, PT *ppt);

    // app name
    virtual void GetStnAppName(PSTN pstn);

    // command handler stuff
    virtual void BuryCmh(PCMH pcmh);
    virtual PCMH PcmhFromHid(int32_t hid);

    // drawing
    virtual void UpdateHwnd(KWND hwnd, RC *prc, uint32_t grfapp = fappNil);
    virtual void MarkRc(RC *prc, PGOB pgobCoo);
    virtual void MarkRegn(PREGN pregn, PGOB pgobCoo);
    virtual void UnmarkRc(RC *prc, PGOB pgobCoo);
    virtual void UnmarkRegn(PREGN pregn, PGOB pgobCoo);
    virtual bool FGetMarkedRc(KWND hwnd, RC *prc);
    virtual void UpdateMarked(void);
    virtual void InvalMarked(KWND hwnd);
    virtual void SetGft(int32_t gft, int32_t lwGft, uint32_t dts = kdtsSecond, PGL pglclr = pvNil, ACR acr = kacrClear);

    // default fonts
    virtual int32_t OnnDefVariable(void);
    virtual int32_t OnnDefFixed(void);
    virtual int32_t DypTextDef(void);

    // basic alert handling
    virtual tribool TGiveAlertSz(const PCSZ psz, int32_t bk, int32_t cok);

    // common commands
    virtual bool FCmdQuit(PCMD pcmd);
    virtual bool FCmdShowClipboard(PCMD pcmd);
    virtual bool FEnableAppCmd(PCMD pcmd, uint32_t *pgrfeds);
    virtual bool FCmdIdle(PCMD pcmd);
    virtual bool FCmdChooseWnd(PCMD pcmd);
#ifdef MAC
    virtual bool FCmdOpenDA(PCMD pcmd);
#endif // MAC

#ifdef DEBUG
    virtual bool FAssertProcApp(PSZS pszsFile, int32_t lwLine, PSZS pszsMsg, void *pv, int32_t cb);
    virtual void WarnProcApp(PSZS pszsFile, int32_t lwLine, PSZS pszsMsg);
#endif // DEBUG

    // cursor stuff
    virtual void SetCurs(PCURS pcurs, bool fLongOp = fFalse);
    virtual void SetCursCno(PRCA prca, CNO cno, bool fLongOp = fFalse);
    virtual void RefreshCurs(void);
    virtual uint32_t GrfcustCur(bool fAsynch = fFalse);
    virtual void ModifyGrfcust(uint32_t grfcustOr, uint32_t grfcustXor);
    virtual void HideCurs(void);
    virtual void ShowCurs(void);
    virtual void PositionCurs(int32_t xpScreen, int32_t ypScreen);
    virtual void BeginLongOp(void);
    virtual void EndLongOp(bool fAll = fFalse);

    // setting and fetching properties
    virtual bool FSetProp(int32_t prid, int32_t lw);
    virtual bool FGetProp(int32_t prid, int32_t *plw);

    // clipboard importing - normally only called by the clipboard object
    virtual bool FImportClip(int32_t clfm, void *pv = pvNil, int32_t cb = 0, PDOCB *ppdocb = pvNil,
                             bool *pfDelay = pvNil);

    // reset tooltip tracking.
    virtual void ResetToolTip(void);

    // modal loop support
    virtual bool FPushModal(PCEX pcex = pvNil);
    virtual bool FModalLoop(int32_t *plwRet);
    virtual void EndModal(int32_t lwRet);
    virtual void PopModal(void);
    virtual bool FCmdEndModal(PCMD pcmd);
    int32_t CactModal(void)
    {
        return _cactModal;
    }
    virtual void BadModalCmd(PCMD pcmd);

    // Query save changes for a document
    virtual tribool TQuerySaveDoc(PDOCB pdocb, bool fForce);

    // flush user generated events from the system event queue.
    virtual void FlushUserEvents(uint32_t grfevt = kgrfevtAll);

    // whether to allow a screen saver to come up
    virtual bool FAllowScreenSaver(void);
};

extern PAPPB vpappb;
extern PCEX vpcex;
extern PSNDM vpsndm;

// main entry point for the client app
void FrameMain(void);

// alert button kinds
enum
{
    bkOk,
    bkOkCancel,
    bkYesNo,
    bkYesNoCancel,
};

// alert icon kinds
enum
{
    cokNil,
    cokInformation, // general info to/from the user
    cokQuestion,    // ask the user something
    cokExclamation, // warn the user and/or ask something
    cokStop,        // inform the user that we can't do that
};

#endif //! APPB_H
