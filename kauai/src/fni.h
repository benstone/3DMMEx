/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    File name handling.

***************************************************************************/
#ifndef FNI_H
#define FNI_H

#ifdef MAC
typedef FSSpec FSS;
#endif // MAC

enum
{
    ffniNil = 0x0000,
    ffniCreateDir = 0x0001,
    ffniMoveToDir = 0x0002,

// for FNI::AssertValid
#ifdef DEBUG
    ffniFile = 0x10000,
    ffniDir = 0x20000,
    ffniEmpty = 0x40000,
#endif
};

// Volume kinds:
enum
{
    fvkNil = 0x0000,
    fvkFloppy = 0x0001,
    fvkNetwork = 0x0002,
    fvkCD = 0x0004,
    fvkRemovable = 0x0008,
};

typedef int32_t FTG; // file type

const FTG ftgNil = KLCONST4('.', '.', '.', ',');
const FTG kftgDir = KLCONST4('.', '.', '.', '.');
const FTG kftgTemp = MacWin(KLCONST4('t', 'e', 'm', 'p'), KLCONST3('T', 'M', 'P')); // the standard temp file ftg
const FTG kftgText = MacWin(KLCONST4('T', 'E', 'X', 'T'), KLCONST3('T', 'X', 'T'));

extern FTG vftgTemp; // the ftg to use for temp files

/****************************************
    File name class
****************************************/
typedef class FNI *PFNI;
#define FNI_PAR BASE
#define kclsFNI KLCONST3('F', 'N', 'I')
class FNI : public FNI_PAR
{
    RTCLASS_DEC
    ASSERT

    friend class FIL;
    friend class FNE;

  private:
    FTG _ftg;
#ifdef MAC
    int32_t _lwDir; // the directory id
    FSS _fss;
#elif defined(WIN)
    STN _stnFile;
#endif // WIN

#ifdef WIN
    void _SetFtgFromName(void);
    int32_t _CchExt(void);
    bool _FChangeLeaf(PSTN pstn);
#endif // WIN

  public:
    FNI(void);

// building FNIs
#ifdef MAC
    bool FGetOpen(FTG *prgftg, short cftg);
    bool FGetSave(FTG ftg, PST pstPrompt, PST pstDefault);
    bool FBuild(int32_t lwVol, int32_t lwDir, PSTN pstn, FTG ftg);
#elif defined(WIN)
    bool FGetOpen(const achar *prgchFilter, HWND hwndOwner);
    bool FGetSave(const achar *prgchFilter, HWND hwndOwner);
    bool FSearchInPath(PSTN pstn, PCSZ pcszEnv = pvNil);
#endif                                                   // WIN
    bool FBuildFromPath(PSTN pstn, FTG ftgDef = ftgNil); // REVIEW shonk: Mac: implement
    bool FGetUnique(FTG ftg);
    bool FGetCwd();
    bool FGetExe();
    bool FGetTemp(void);
    void SetNil(void);

    FTG Ftg(void);
    uint32_t Grfvk(void); // volume kind (floppy/net/CD/etc)
    bool FChangeFtg(FTG ftg);

    bool FSetLeaf(PSTN pstn, FTG ftg = ftgNil);
    void GetLeaf(PSTN pstn);
    void GetStnPath(PSTN pstn);

    tribool TExists(void);
    bool FDelete(void);
    bool FRename(PFNI pfniNew);
    bool FEqual(PFNI pfni);

    bool FDir(void);
    bool FSameDir(PFNI pfni);
    bool FDownDir(PSTN pstn, uint32_t grffni);
    bool FUpDir(PSTN pstn, uint32_t grffni);
};

#ifdef MAC
#define FGetFniOpenMacro(pfni, prgftg, cftg, prgchFilter, hwndOwner) (pfni)->FGetOpen(prgftg, cftg)
#define FGetFniSaveMacro(pfni, ftg, pstPrompt, pstDef, prgchFilter, hwndOwner) (pfni)->FGetSave(ftg, pstPrompt, pstDef)
#endif // MAC
#ifdef WIN
#define FGetFniOpenMacro(pfni, prgftg, cftg, prgchFilter, hwndOwner) (pfni)->FGetOpen(prgchFilter, hwndOwner)
#define FGetFniSaveMacro(pfni, ftg, pstPrompt, pstDef, prgchFilter, hwndOwner) (pfni)->FGetSave(prgchFilter, hwndOwner)
#endif // WIN

/****************************************
    File name enumerator.
****************************************/
const int32_t kcftgFneBase = 20;

enum
{
    ffneNil = 0,
    ffneRecurse = 1,

    // for FNextFni
    ffnePre = 0x10,
    ffnePost = 0x20,
    ffneSkipDir = 0x80,
};

#define FNE_PAR BASE
#define kclsFNE KLCONST3('F', 'N', 'E')
class FNE : public FNE_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    NOCOPY(FNE)

  private:
    // file enumeration state
    struct FES
    {
#ifdef MAC
        int32_t lwVol;
        int32_t lwDir;
        int32_t iv;
#endif // MAC
#ifdef WIN
        FNI fni; // directory fni
        HN hn;   // for enumerating files/directories
        WIN32_FIND_DATA wfd;
        uint32_t grfvol; // which volumes are available (for enumerating volumes)
        int32_t chVol;   // which volume we're on (for enumerating volumes)
#endif                   // WIN
    };

    FTG _rgftg[kcftgFneBase];
    FTG *_prgftg;
    int32_t _cftg;
    bool _fRecurse : 1;
    bool _fInited : 1;
    PGL _pglfes;
    FES _fesCur;

    void _Free(void);
#ifdef WIN
    bool _FPop(void);
#endif // WIN

  public:
    FNE(void);
    ~FNE(void);

    bool FInit(FNI *pfniDir, FTG *prgftg, int32_t cftg, uint32_t grffne = ffneNil);
    bool FNextFni(FNI *pfni, uint32_t *pgrffneOut = pvNil, uint32_t grffneIn = ffneNil);
};

#endif //! FNI_H
