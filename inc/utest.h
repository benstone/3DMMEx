/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    utest.h: Socrates main app class

    Primary Author: ******
    Review Status: REVIEWED - any changes to this file must be reviewed!

***************************************************************************/
#ifndef UTEST_H
#define UTEST_H

/****************************************
    KidWorld for the App class
****************************************/
typedef class KWA *PKWA;
#define KWA_PAR WOKS
#define kclsKWA KLCONST3('K', 'W', 'A')
class KWA : public KWA_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    PMBMP _pmbmp; // MBMP to draw in KWA (may be pvNil)
    bool _fAskForCD;

  public:
    KWA(GCB *pgcb) : WOKS(pgcb)
    {
        _fAskForCD = fTrue;
    }
    ~KWA(void);
    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FFindFile(PSTN pstnSrc, PFNI pfni) override; // for finding AVIs
    virtual bool FModalTopic(PRCA prca, CNO cnoTopic, int32_t *plwRet) override;
    void SetMbmp(PMBMP pmbmp);
    void SetCDPrompt(bool fAskForCD)
    {
        _fAskForCD = fAskForCD;
    }
    bool FAskForCD(void)
    {
        return _fAskForCD;
    }
};

//
// If you change anything for the registry, notify SeanSe for setup changes.
//
#define kszSocratesKey PszLit("Software\\Microsoft\\Microsoft Kids\\3D Movie Maker")
#define kszWaveOutMsgValue PszLit("WaveOutMsg")
#define kszMidiOutMsgValue PszLit("MidiOutMsg")
#define kszGreaterThan8bppMsgValue PszLit("GreaterThan8bppMsg")
#define kszSwitchResolutionValue PszLit("SwitchResolution")
#define kszHomeDirValue PszLit("HomeDirectory")
#define kszInstallDirValue PszLit("InstallDirectory")
#define kszProductsKey PszLit("Software\\Microsoft\\Microsoft Kids\\3D Movie Maker\\Products")
#define kszUserDataValue PszLit("UserData")
#define kszBetterSpeedValue PszLit("BetterSpeed")

// If fTrue, play the startup sound and wait for it to finish.
#define kszStartupSoundValue PszLit("StartupSound")
#define kfStartupSoundDefault fTrue

// If fTrue, skip recompressing audio on import
#define kszHighQualitySoundImport PszLit("HighQualitySoundImport")
#define kszHighQualitySoundImportDefault fFalse

// If fTrue, mix sound in 44.1KHz 16-bit Stereo
#define kszStereoSound PszLit("StereoSound")
#define kszStereoSoundDefault fFalse

// FGetSetRegKey flags
enum
{
    fregNil = 0,
    fregSetKey = 0x01,
    fregSetDefault = 0x02,
    fregString = 0x04,
    fregBinary = 0x08, // not boolean
    fregMachine = 0x10
};

/****************************************
    The app class
****************************************/
typedef class APP *PAPP;
#define APP_PAR APPB
#define kclsAPP KLCONST3('A', 'P', 'P')
class APP : public APP_PAR
{
    RTCLASS_DEC
    CMD_MAP_DEC(APP)
    ASSERT
    MARKMEM

  protected:
    bool _fDontReportInitFailure; // init failure was already reported
    bool _fOnscreenDrawing;
    PCFL _pcfl;                   // resource file for app
    PSTDIO _pstdio;               // Current studio
    PTATR _ptatr;                 // Current theater
    PCRM _pcrmAll;                // The app CRM -- all crfs are loaded into this.
    PGL _pglicrfBuilding;         // List of crfs in _pcrmAll belonging to Building.
    PGL _pglicrfStudio;           // List of crfs in _pcrmAll belonging to Studio.
    bool _fDontMinimize : 1,      // "/M" command-line switch
        _fSlowCPU : 1,            // running on slow CPU
        _fSwitchedResolution : 1, // we successfully switched to 640x480 mode
        _fMainWindowCreated : 1, _fMinimized : 1,
        _fRunInWindow : 1, // run in a window (as opposed to fullscreen)
        _fFontError : 1,   // Have we already seen a font error?
        _fInPortfolio : 1; // Is the portfolio active?
    PCEX _pcex;            // Pointer to suspended cex.
    FNI _fniPortfolioDoc;  // document last opened in portfolio
    PMVIE _pmvieHandoff;   // Stores movie for studio to use
    PKWA _pkwa;            // Kidworld for App
    PGST _pgstBuildingFiles;
    PGST _pgstStudioFiles;
    PGST _pgstSharedFiles;
    PGST _pgstApp;        // Misc. app global strings
    STN _stnAppName;      // App name
    STN _stnProductLong;  // Long version of product name
    STN _stnProductShort; // Short version of product name
    STN _stnUser;         // User's name
    int32_t _sidProduct;
    FNI _fniCurrentDir;  // fni of current working directory
    FNI _fniExe;         // fni of this executable file
    FNI _fniMsKidsDir;   // e.g., \mskids
    FNI _fniUsersDir;    // e.g., \mskids\users
    FNI _fniMelanieDir;  // e.g., \mskids\users\melanie
    FNI _fniProductDir;  // e.g., \mskids\3dmovie or \mskids\otherproduct
    FNI _fniUserDir;     // User's preferred directory
    FNI _fni3DMovieDir;  // e.g., \mskids\3dMovie
    int32_t _dypTextDef; // Default text height

    int32_t _cactDisable; // disable count for keyboard accelerators
#ifdef BUG1085
    int32_t _cactCursHide; // hide count for cursor
    int32_t _cactCursSav;  // saved count for cursor
#endif

    //
    //
    //
    bool _fDown;
    int32_t _cactToggle;

#ifdef WIN
    HACCEL _haccel;
    HACCEL _haccelGlobal;
#endif

  protected:
    bool _FAppAlreadyRunning(void);
    void _TryToActivateWindow(void);
    bool _FEnsureOS(void);
    bool _FEnsureAudio(void);
    bool _FEnsureVideo(void);
    bool _FEnsureColorDepth(void);
    bool _FEnsureDisplayResolution(void);
    bool _FDisplaySwitchSupported(void);
    void _ParseCommandLine(void);
    void _SkipToSpace(char **ppch);
    void _SkipSpace(char **ppch);
    bool _FEnsureProductNames(void);
    bool _FFindProductDir(PGST pgst);
    bool _FQueryProductExists(STN *pstnLong, STN *pstnShort, FNI *pfni);
    bool _FFindMsKidsDir(void);
    bool _FFindMsKidsDirAt(FNI *path);
    bool _FCantFindFileDialog(PSTN pstn);
    bool _FGenericError(PCSZ message);
    bool _FGenericError(PSTN message);
    bool _FGenericError(FNI *path);
    bool _FGetUserName(void);
    bool _FGetUserDirectories(void);
    bool _FReadUserData(void);
    bool _FWriteUserData(void);
    bool _FDisplayHomeLogo(void);
    bool _FDetermineIfSlowCPU(void);
    bool _FOpenResourceFile(void);
    bool _FInitKidworld(void);
    bool _FInitProductNames(void);
    bool _FReadTitlesFromReg(PGST *ppgst);
    bool _FInitTdt(void);
    PGST _PgstRead(CNO cno);
    bool _FReadStringTables(void);
    bool _FSetWindowTitle(void);
    bool _FInitCrm(void);
    bool _FAddToCrm(PGST pgstFiles, PCRM pcrm, PGL pglFiles);
    bool _FInitBuilding(void);
    bool _FInitStudio(PFNI pfniUserDoc, bool fFailIfDocOpenFailed = fTrue);
    void _GetWindowProps(int32_t *pxp, int32_t *pyp, int32_t *pdxp, int32_t *pdyp, DWORD *pdwStyle);
    void _RebuildMainWindow(void);
    bool _FSwitch640480(bool fTo640480);
    bool _FDisplayIs640480(void);
    bool _FShowSplashScreen(void);
    bool _FPlaySplashSound(void);
    PMVIE _Pmvie(void);
    void _CleanupTemp(void);
#ifdef WIN
    bool _FSendOpenDocCmd(HWND hwnd, PFNI pfniUserDoc);
    bool _FProcessOpenDocCmd(void);
#endif // WIN

    // APPB methods that we override
    virtual bool _FInit(uint32_t grfapp, uint32_t grfgob, int32_t ginDef) override;
    virtual bool _FInitOS(void) override;
    virtual bool _FInitMenu(void) override
    {
        return fTrue;
    } // no menubar
    virtual void _CopyPixels(PGNV pgvnSrc, RC *prcSrc, PGNV pgnvDst, RC *prcDst) override;
    virtual void _FastUpdate(PGOB pgob, PREGN pregnClip, uint32_t grfapp = fappNil, PGPT pgpt = pvNil) override;
    virtual void _CleanUp(void) override;
    virtual void _Activate(bool fActive) override;
    virtual bool _FGetNextEvt(PEVT pevt) override;
#ifdef WIN
    virtual bool _FFrameWndProc(HWND hwnd, UINT wm, WPARAM wParam, LPARAM lw, int32_t *plwRet) override;
#endif // WIN

  public:
    APP(void)
    {
        _dypTextDef = 0;
    }

    // Overridden APPB functions
    virtual void GetStnAppName(PSTN pstn) override;
    virtual int32_t OnnDefVariable(void) override;
    virtual int32_t DypTextDef(void) override;
    virtual tribool TQuerySaveDoc(PDOCB pdocb, bool fForce) override;
    virtual void Quit(bool fForce) override;
    virtual void UpdateHwnd(KWND hwnd, RC *prc, uint32_t grfapp = fappNil) override;
    virtual void Run(uint32_t grfapp, uint32_t grfgob, int32_t ginDef) override;
#ifdef BUG1085
    virtual void HideCurs(void) override;
    virtual void ShowCurs(void) override;

    // New cursor methods
    void PushCurs(void);
    void PopCurs(void);
#endif // BUG 1085

    // Command processors
    bool FCmdLoadStudio(PCMD pcmd);
    bool FCmdLoadBuilding(PCMD pcmd);
    bool FCmdTheaterOpen(PCMD pcmd);
    bool FCmdTheaterClose(PCMD pcmd);
    virtual bool FCmdIdle(PCMD pcmd) override;
    bool FCmdInfo(PCMD pcmd);
    bool FCmdPortfolioClear(PCMD pcmd);
    bool FCmdPortfolioOpen(PCMD pcmd);
    bool FCmdDisableAccel(PCMD pcmd);
    bool FCmdEnableAccel(PCMD pcmd);
    bool FCmdInvokeSplot(PCMD pcmd);
    bool FCmdExitStudio(PCMD pcmd);
    bool FCmdDeactivate(PCMD pcmd);

    static bool FInsertCD(PSTN pstnTitle);
    void DisplayErrors(void);
    void SetPortfolioDoc(PFNI pfni)
    {
        _fniPortfolioDoc = *pfni;
    }
    void GetPortfolioDoc(PFNI pfni)
    {
        *pfni = _fniPortfolioDoc;
    }
    void SetFInPortfolio(bool fInPortfolio)
    {
        _fInPortfolio = fInPortfolio;
    }
    bool FInPortfolio(void)
    {
        return _fInPortfolio;
    }

    PSTDIO Pstdio(void)
    {
        return _pstdio;
    }
    PKWA Pkwa(void)
    {
        return _pkwa;
    }
    PCRM PcrmAll(void)
    {
        return _pcrmAll;
    }
    bool FMinimized()
    {
        return _fMinimized;
    }

    bool FGetStnApp(int32_t ids, PSTN pstn)
    {
        return _pgstApp->FFindExtra(&ids, pstn);
    }
    void GetStnProduct(PSTN pstn)
    {
        *pstn = _stnProductLong;
    }
    void GetStnUser(PSTN pstn)
    {
        *pstn = _stnUser;
    }
    void GetFniExe(PFNI pfni)
    {
        *pfni = _fniExe;
    }
    void GetFniProduct(PFNI pfni)
    {
        *pfni = _fniProductDir;
    }
    void GetFniUsers(PFNI pfni)
    {
        *pfni = _fniUsersDir;
    }
    void GetFniUser(PFNI pfni)
    {
        *pfni = _fniUserDir;
    }
    void GetFniMelanie(PFNI pfni)
    {
        *pfni = _fniMelanieDir;
    }
    int32_t SidProduct(void)
    {
        return _sidProduct;
    }
    bool FGetOnn(PSTN pstn, int32_t *ponn);
    void MemStat(int32_t *pdwTotalPhys, int32_t *pdwAvailPhys = pvNil);
    bool FSlowCPU(void)
    {
        return _fSlowCPU;
    }

    // Kid-friendly modal dialog stuff:
    void EnsureInteractive(void)
    {
#ifdef WIN
        if (_fMinimized || GetForegroundWindow() != vwig.hwndApp)
#else
        if (_fMinimized)
#endif
        {
#ifdef WIN
            SetForegroundWindow(vwig.hwndApp);
            ShowWindow(vwig.hwndApp, SW_RESTORE);
#else  //! WIN
            RawRtn();
#endif //! WIN
        }
    }
    tribool TModal(PRCA prca, int32_t tpc, PSTN pstnBackup = pvNil, int32_t bkBackup = ivNil, int32_t stidSubst = ivNil,
                   PSTN pstnSubst = pvNil);

    // Enable/disable accelerator keys
    void DisableAccel(void);
    void EnableAccel(void);

    // Registry access function
    bool FGetSetRegKey(PCSZ pszValueName, void *pvData, int32_t cbData, uint32_t grfreg = fregSetDefault,
                       bool *pfNoValue = pvNil);

    // Movie handoff routines
    void HandoffMovie(PMVIE pmvie);
    PMVIE PmvieRetrieve(void);

    // Determines whether screen savers should be blocked.
    virtual bool FAllowScreenSaver(void) override;
};

#define vpapp ((APP *)vpappb)

#endif //! UTEST_H
