/* Copyright (c) Mark Cave-Ayland.
   Licensed under the MIT License. */

/***************************************************************************
    Author: Mark Cave-Ayland
    Project: Kauai
    Reviewed:
    Copyright (c) Mark Cave-Ayland

    File name management.

***************************************************************************/
#include "util.h"
#include <filesystem>

namespace fs = std::filesystem;

ASSERTNAME

// This is the FTG to use for temp files - clients may set this to whatever
// they want.
FTG vftgTemp = kftgTemp;

// maximal number of short characters in an extension is 4 (so it fits in
// a long).
const long kcchsMaxExt = SIZEOF(int32_t);

priv void _CleanFtg(FTG *pftg, PSTN pstnExt = pvNil);
FNI _fniTemp;

RTCLASS(FNI)
RTCLASS(FNE)

/***************************************************************************
    Sets the fni to nil values.
***************************************************************************/
void FNI::SetNil(void)
{
    _ftg = ftgNil;
    _stnFile.SetNil();
    AssertThis(ffniEmpty);
}

/***************************************************************************
    Constructor for fni class.
***************************************************************************/
FNI::FNI(void)
{
    SetNil();
}

/***************************************************************************
    Get an fni (for opening) from the user.
***************************************************************************/
bool FNI::FGetOpen(const achar *prgchFilter, KWND hwndOwner)
{
    AssertThis(0);
    AssertNilOrVarMem(prgchFilter);

    // Should be unused
    RawRtn();
    return fFalse;
}

/***************************************************************************
    Get an fni (for saving) from the user.
***************************************************************************/
bool FNI::FGetSave(const achar *prgchFilter, KWND hwndOwner)
{
    AssertThis(0);
    AssertNilOrVarMem(prgchFilter);

    // Should be unused
    RawRtn();
    return fFalse;
}

/******************************************************************************
    Will attempt to build an FNI with the given filename.  Uses the
    Windows SearchPath API, and thus the Windows path*search rules.

    Arguments:
        PSTN pstn ** the filename to look for

    Returns: fTrue if it could find the file
******************************************************************************/
bool FNI::FSearchInPath(PSTN pstn, PCSZ pcszEnv)
{
    AssertThis(0);
    AssertPo(pstn, 0);

    int32_t cch;
    fs::path path;
    PCSZ sz;

    if (pcszEnv)
    {
        path = pcszEnv;
    }
    else
    {
        path = PszLit("");
    }

    path = path / pstn->Psz();
    sz = path.c_str();
    cch = strlen(sz);

    Assert(cch <= kcchMaxSz, 0);
    _stnFile = sz;
    _SetFtgFromName();

    AssertThis(ffniFile | ffniDir);
    return fTrue;
}

/***************************************************************************
    Builds the fni from the path.
***************************************************************************/
bool FNI::FBuildFromPath(PSTN pstn, FTG ftgDef)
{
    AssertThis(0);
    AssertPo(pstn, 0);

    int32_t cch;
    const achar *pchT;
    fs::path fullpath;
    PCSZ sz;

    if (kftgDir != ftgDef)
    {
        // if the path ends with a slash or only has periods after the last
        // slash, force the fni to be a directory.

        cch = pstn->Cch();
        for (pchT = pstn->Prgch() + cch - 1;; pchT--)
        {
            if (cch-- <= 0 || *pchT == ChLit('\\') || *pchT == ChLit('/'))
            {
                ftgDef = kftgDir;
                break;
            }
            if (*pchT != ChLit('.'))
                break;
        }
    }

    fullpath = pstn->Psz();
    sz = fullpath.c_str();
    cch = strlen(sz);
    if (cch > kcchMaxSz)
    {
        goto LFail;
    }

    Assert(cch <= kcchMaxSz, 0);
    _stnFile = sz;

    if (ftgDef == kftgDir)
    {
        achar ch = _stnFile.Prgch()[_stnFile.Cch() - 1];
        if (ch != ChLit('\\') && ch != ChLit('/'))
        {
            if (!_stnFile.FAppendCh(ChLit('/')))
            {
                goto LFail;
            }
        }
        _ftg = kftgDir;
    }
    else
    {
        _SetFtgFromName();
        if (_ftg == 0 && ftgDef != ftgNil && pstn->Prgch()[pstn->Cch() - 1] != ChLit('.') && !FChangeFtg(ftgDef))
        {
        LFail:
            SetNil();
            PushErc(ercFniGeneral);
            return fFalse;
        }
    }

    AssertThis(ffniFile | ffniDir);
    return fTrue;
}

/***************************************************************************
    Get a unique filename in the directory currently indicated by the fni.
***************************************************************************/
bool FNI::FGetUnique(FTG ftg)
{
    AssertThis(ffniFile | ffniDir);
    static short _dsw = 0;
    STN stn;
    STN stnOld;
    short sw;
    long cact;

    if (Ftg() == kftgDir)
        stnOld.SetNil();
    else
        GetLeaf(&stnOld);

    sw = (short)TsCurrentSystem() + ++_dsw;
    for (cact = 20; cact != 0; cact--, sw += ++_dsw)
    {
        stn.FFormatSz(PszLit("Temp%04x"), (long)sw);
        if (stn.FEqual(&stnOld))
            continue;
        if (FSetLeaf(&stn, ftg) && TExists() == tNo)
            return fTrue;
    }
    SetNil();
    PushErc(ercFniGeneral);
    return fFalse;
}

/***************************************************************************
    Get a temporary fni.
***************************************************************************/
bool FNI::FGetTemp(void)
{
    AssertThis(0);

    if (_fniTemp._ftg != kftgDir)
    {
        // get the temp directory
        fs::path tmppath = fs::temp_directory_path();
        tmppath = tmppath / "";

        PCSZ sz = tmppath.c_str();
        if (sz == NULL)
        {
            PushErc(ercFniGeneral);
            return fFalse;
        }
        _fniTemp._stnFile = sz;
        _fniTemp._ftg = kftgDir;
        AssertPo(&_fniTemp, ffniDir);
    }
    *this = _fniTemp;
    return FGetUnique(vftgTemp);
}

/***************************************************************************
    Set the FNI to the current working directory
***************************************************************************/
bool FNI::FGetCwd()
{
    AssertThis(0);

    STN stnCurrentDir = PszLit(".");
    return FBuildFromPath(&stnCurrentDir, kftgDir);
}

/***************************************************************************
    Set the FNI to the current executable file
***************************************************************************/
bool FNI::FGetExe()
{
    AssertThis(0);

    bool fRet;
    char sz[kcchMaxSz];
    STN stnExe;

    GetExecutableName(sz, kcchMaxSz);
    stnExe.SetSz(sz);

    return FBuildFromPath(&stnExe);
}

/***************************************************************************
    Return the file type of the fni.
***************************************************************************/
FTG FNI::Ftg(void)
{
    AssertThis(0);
    return _ftg;
}

/***************************************************************************
    Return the volume kind for the given fni.
***************************************************************************/
uint32_t FNI::Grfvk(void)
{
    AssertThis(0);
    uint32_t grfvk = fvkNil;

    // Should be unused
    RawRtn();
    return grfvk;
}

/***************************************************************************
    Set the leaf to the given string and type.
***************************************************************************/
bool FNI::FSetLeaf(PSTN pstn, FTG ftg)
{
    AssertThis(ffniFile | ffniDir);
    AssertNilOrPo(pstn, 0);

    _CleanFtg(&ftg);
    Assert(FPure(ftg == kftgDir) == FPure(pstn == pvNil || pstn->Cch() == 0), "ftg doesn't match pstn");
    if (!_FChangeLeaf(pstn))
        goto LFail;

    if ((kftgDir != ftg) && (ftgNil != ftg) && !FChangeFtg(ftg))
        goto LFail;

    AssertThis(ffniFile | ffniDir);
    return fTrue;

LFail:
    SetNil();
    PushErc(ercFniGeneral);
    return fFalse;
}

/******************************************************************************
    Changes just the FTG of the FNI, leaving the file path and filename alone
    (but does change the extension). Returns: fTrue if it succeeds
******************************************************************************/
bool FNI::FChangeFtg(FTG ftg)
{
    AssertThis(ffniFile);
    Assert(ftg != ftgNil && ftg != kftgDir, "Bad FTG");
    STN stnFtg;
    int32_t cchBase;

    _CleanFtg(&ftg, &stnFtg);
    if (_ftg == ftg)
        return fTrue;

    // set the extension
    cchBase = _stnFile.Cch() - _CchExt();

    // use >= to leave room for the '.'
    if (cchBase + stnFtg.Cch() >= kcchMaxStn)
        return fFalse;

    _stnFile.Delete(cchBase);
    _ftg = ftg;
    if (stnFtg.Cch() > 0)
    {
        _stnFile.FAppendCh(ChLit('.'));
        _stnFile.FAppendStn(&stnFtg);
    }
    return fTrue;
}

/***************************************************************************
    Get the leaf name.
***************************************************************************/
void FNI::GetLeaf(PSTN pstn)
{
    AssertThis(0);
    AssertPo(pstn, 0);
    achar *pch;
    PSZ psz = _stnFile.Psz();

    for (pch = psz + _stnFile.Cch(); pch-- > psz && *pch != '\\' && *pch != '/';)
    {
    }
    Assert(pch > psz, "bad fni");

    pstn->SetSz(pch + 1);
}

/***************************************************************************
    Get a string representing the path of the fni.
***************************************************************************/
void FNI::GetStnPath(PSTN pstn)
{
    AssertThis(0);
    AssertPo(pstn, 0);
    *pstn = _stnFile;
}

/***************************************************************************
    Determines if the file/directory exists.  Returns tMaybe on error or
    if the fni type (file or dir) doesn't match the disk object of the
    same name.
***************************************************************************/
tribool FNI::TExists(void)
{
    AssertThis(ffniFile | ffniDir);
    STN stn;
    PSTN pstn;
    uint32_t lu;

    // strip off the trailing slash (if a directory).
    pstn = &_stnFile;
    if (_ftg == kftgDir)
    {
        int32_t cch;

        stn = _stnFile;
        pstn = &stn;
        cch = stn.Cch();
        Assert(cch > 0 && (stn.Psz()[cch - 1] == ChLit('\\') || stn.Psz()[cch - 1] == ChLit('/')), 0);
        stn.Delete(cch - 1);
    }

    if (!fs::exists(pstn->Psz()))
    {
        return tNo;
    }
    if ((_ftg == kftgDir) != fs::is_directory(pstn->Psz()))
    {
        PushErc(ercFniMismatch);
        return tMaybe;
    }

    return tYes;
}

/***************************************************************************
    Delete the physical file.  Should not be open.
***************************************************************************/
bool FNI::FDelete(void)
{
    AssertThis(ffniFile);
    Assert(FIL::PfilFromFni(this) == pvNil, "file is open");

    if (!std::remove(_stnFile.Psz()))
        return fTrue;
    PushErc(ercFniDelete);
    return fFalse;
}

/***************************************************************************
    Renames the file indicated by this to *pfni.
***************************************************************************/
bool FNI::FRename(FNI *pfni)
{
    AssertThis(ffniFile);
    AssertPo(pfni, ffniFile);
    fs::perms perms;

    perms = fs::status(_stnFile.Psz()).permissions();
    if (!((perms & fs::perms::owner_write) == fs::perms::none))
    {
        fs::path src = fs::path(_stnFile.Psz());
        fs::path dst = fs::path(pfni->_stnFile.Psz());

        fs::rename(src, dst);
        return fTrue;
    }
    PushErc(ercFniRename);
    return fFalse;
}

/***************************************************************************
    Compare two fni's for equality.
***************************************************************************/
bool FNI::FEqual(FNI *pfni)
{
    AssertThis(ffniFile | ffniDir);
    AssertPo(pfni, ffniFile | ffniDir);

    return pfni->_stnFile.FEqualUser(&_stnFile);
}

/***************************************************************************
    Return whether the fni refers to a directory.
***************************************************************************/
bool FNI::FDir(void)
{
    AssertThis(0);
    return _ftg == kftgDir;
}

/***************************************************************************
    Return whether the directory portions of the fni's are the same.
***************************************************************************/
bool FNI::FSameDir(FNI *pfni)
{
    AssertThis(ffniFile | ffniDir);
    AssertPo(pfni, ffniFile | ffniDir);
    FNI fni1, fni2;

    fni1 = *this;
    fni2 = *pfni;
    fni1._FChangeLeaf(pvNil);
    fni2._FChangeLeaf(pvNil);
    return fni1.FEqual(&fni2);
}

/***************************************************************************
    Determine if the directory pstn in fni exists, optionally creating it
    and/or moving into it.  Specify ffniCreateDir to create it if it
    doesn't exist.  Specify ffniMoveTo to make the fni refer to it.
***************************************************************************/
bool FNI::FDownDir(PSTN pstn, uint32_t grffni)
{
    AssertThis(ffniDir);
    AssertPo(pstn, 0);

    FNI fniT;

    fniT = *this;
    // the +1 is for the \ character
    if (fniT._stnFile.Cch() + pstn->Cch() + 1 > kcchMaxStn)
    {
        PushErc(ercFniGeneral);
        return fFalse;
    }
    AssertDo(fniT._stnFile.FAppendStn(pstn), 0);
    AssertDo(fniT._stnFile.FAppendCh(ChLit('/')), 0);
    fniT._ftg = kftgDir;
    AssertPo(&fniT, ffniDir);

    if (fniT.TExists() != tYes)
    {
        if (!(grffni & ffniCreateDir))
            return fFalse;
        // try to create it
        if (!fs::create_directory(fniT._stnFile.Psz()))
        {
            PushErc(ercFniDirCreate);
            return fFalse;
        }
    }
    if (grffni & ffniMoveToDir)
        *this = fniT;

    return fTrue;
}

/***************************************************************************
    Gets the lowest directory name (if pstn is not nil) and optionally
    moves the fni up a level (if ffniMoveToDir is specified).
***************************************************************************/
bool FNI::FUpDir(PSTN pstn, uint32_t grffni)
{
    AssertThis(ffniDir);
    AssertNilOrPo(pstn, 0);

    int32_t cch;
    achar *pchT;
    PCSZ sz;
    STN stn;
    fs::path fullpath;

    stn = _stnFile;
    if (!stn.FAppendSz(PszLit("..")))
        return fFalse;

    fullpath = fs::canonical(stn.Psz());
    sz = fullpath.c_str();
    cch = strlen(sz);
    if (cch >= _stnFile.Cch() - 1)
    {
        return fFalse;
    }
    Assert(cch <= kcchMaxSz, 0);
    Assert(cch < _stnFile.Cch() + 2, 0);
    stn = sz;
    switch (stn.Psz()[cch - 1])
    {
    case ChLit('\\'):
    case ChLit('/'):
        break;
    default:
        AssertDo(stn.FAppendCh(ChLit('/')), 0);
        cch++;
        break;
    }

    if (pvNil != pstn)
    {
        // copy the tail and delete the trailing slash
        pstn->SetSz(_stnFile.Psz() + cch);
        pstn->Delete(pstn->Cch() - 1);
    }

    if (grffni & ffniMoveToDir)
    {
        _stnFile = stn;
        AssertThis(ffniDir);
    }
    return fTrue;
}

#ifdef DEBUG
/***************************************************************************
    Assert validity of the FNI.
***************************************************************************/
void FNI::AssertValid(uint32_t grffni)
{
    FNI_PAR::AssertValid(0);
    AssertPo(&_stnFile, 0);

    fs::path fullpath;
    PCSZ szT;
    int32_t cch;
    PCSZ pszT;

    if (grffni == 0)
        grffni = ffniEmpty | ffniDir | ffniFile;

    if (_ftg == ftgNil)
    {
        Assert(grffni & ffniEmpty, "unexpected empty");
        Assert(_stnFile.Cch() == 0, "named empty?");
        return;
    }
#ifdef WIN
    if ((cch = GetFullPathName(_stnFile.Psz(), kcchMaxSz, szT, &pszT)) == 0 || cch > kcchMaxSz ||
        !_stnFile.FEqualUserRgch(szT, CchSz(szT)))
    {
        Bug("bad fni");
        return;
    }
#endif
    fullpath = _stnFile.Psz();
    szT = fullpath.c_str();
    cch = strlen(fullpath.c_str());
    if ((cch > kcchMaxSz) || !_stnFile.FEqualUserRgch(szT, CchSz(szT)))
    {
        Bug("bad fni");
        return;
    }
    pszT = &szT[cch - strlen(fullpath.filename().c_str())];

    if (_ftg == kftgDir)
    {
        Assert(grffni & ffniDir, "unexpected dir");
        Assert(szT[cch - 1] == ChLit('\\') || szT[cch - 1] == ChLit('/'), "expected trailing slash");
        Assert(strlen(fullpath.filename().c_str()) == 0, "unexpected filename");
    }
    else
    {
        Assert(grffni & ffniFile, "unexpected file");
        Assert(pszT >= szT && pszT < szT + cch, "expected filename");
    }
}
#endif // DEBUG

/***************************************************************************
    Find the length of the file extension on the fni (including the period).
    Allow up to kcchsMaxExt characters for the extension (plus one for the
    period).
***************************************************************************/
int32_t FNI::_CchExt(void)
{
    AssertBaseThis(0);
    int32_t cch;
    PSZ psz = _stnFile.Psz();
    achar *pch = psz + _stnFile.Cch() - 1;

    for (cch = 1; cch <= kcchsMaxExt + 1 && pch >= psz; cch++, pch--)
    {
        if ((achar)(schar)*pch != *pch)
        {
            // not an ANSI character - so doesn't qualify for our
            // definition of an extension
            return 0;
        }

        switch (*pch)
        {
        case ChLit('.'):
            return cch;
        case ChLit('\\'):
        case ChLit('/'):
            return 0;
        }
    }

    return 0;
}

/***************************************************************************
    Set the ftg from the file name.
***************************************************************************/
void FNI::_SetFtgFromName(void)
{
    AssertBaseThis(0);
    Assert(_stnFile.Cch() > 0, 0);
    int32_t cch, ich;
    achar *pchLim = _stnFile.Psz() + _stnFile.Cch();

    if (pchLim[-1] == ChLit('\\') || pchLim[-1] == ChLit('/'))
        _ftg = kftgDir;
    else
    {
        _ftg = 0;
        cch = _CchExt() - 1;
        AssertIn(cch, -1, kcchsMaxExt + 1);
        pchLim -= cch;
        for (ich = 0; ich < cch; ich++)
            _ftg = (_ftg << 8) | (int32_t)(uint8_t)tolower((schar)pchLim[ich]);
    }
    AssertThis(ffniFile | ffniDir);
}

/***************************************************************************
    Change the leaf of the fni.
***************************************************************************/
bool FNI::_FChangeLeaf(PSTN pstn)
{
    AssertThis(ffniFile | ffniDir);
    AssertNilOrPo(pstn, 0);

    achar *pch;
    PSZ psz;
    int32_t cchBase, cch;

    psz = _stnFile.Psz();
    for (pch = psz + _stnFile.Cch(); pch-- > psz && *pch != ChLit('\\') && *pch != ChLit('/');)
    {
    }
    Assert(pch >= psz, "bad fni");

    cchBase = pch - psz + 1;
    _stnFile.Delete(cchBase);
    _ftg = kftgDir;
    if (pstn != pvNil && (cch = pstn->Cch()) > 0)
    {
        if (cchBase + cch > kcchMaxStn)
            return fFalse;
        AssertDo(_stnFile.FAppendStn(pstn), 0);
        _SetFtgFromName();
    }
    AssertThis(ffniFile | ffniDir);
    return fTrue;
}

/***************************************************************************
    Make sure the ftg is all lowercase and has no characters after a zero.
***************************************************************************/
priv void _CleanFtg(FTG *pftg, PSTN pstnExt)
{
    AssertVarMem(pftg);
    AssertNilOrPo(pstnExt, 0);

    int32_t ichs;
    schar chs;
    bool fZero;
    FTG ftgNew;

    if (pvNil != pstnExt)
        pstnExt->SetNil();

    if (*pftg == kftgDir || *pftg == ftgNil)
        return;

    fZero = fFalse;
    ftgNew = 0;
    for (ichs = 0; ichs < kcchsMaxExt; ichs++)
    {
        chs = (schar)((uint32_t)*pftg >> (ichs * 8));
        fZero |= (chs == 0);
        if (!fZero)
        {
            chs = ChsLower(chs);
            ftgNew |= (int32_t)(uint8_t)chs << (8 * ichs);
            if (pvNil != pstnExt)
                pstnExt->FInsertCh(0, (achar)(uint8_t)chs);
        }
    }

    *pftg = ftgNew;
}

/***************************************************************************
    Constructor for a File Name Enumerator.
***************************************************************************/
FNE::FNE(void)
{
    AssertBaseThis(0);
    _prgftg = _rgftg;
    _pglfes = pvNil;
    _fInited = fFalse;
    AssertThis(0);
}

/***************************************************************************
    Destructor for an FNE.
***************************************************************************/
FNE::~FNE(void)
{
    AssertBaseThis(0);
    _Free();
}

/***************************************************************************
    Free all the memory associated with the FNE.
***************************************************************************/
void FNE::_Free(void)
{
    if (_prgftg != _rgftg)
    {
        FreePpv((void **)&_prgftg);
        _prgftg = _rgftg;
    }
    _fInited = fFalse;
    ReleasePpo(&_pglfes);
    AssertThis(0);
}

/***************************************************************************
    Initialize the fne to do an enumeration.
***************************************************************************/
bool FNE::FInit(FNI *pfniDir, FTG *prgftg, int32_t cftg, uint32_t grffne)
{
    AssertThis(0);
    AssertNilOrVarMem(pfniDir);
    AssertIn(cftg, 0, kcbMax);
    AssertPvCb(prgftg, LwMul(cftg, SIZEOF(FTG)));
    FTG *pftg;

    // free the old stuff
    _Free();

    if (0 >= cftg)
        _cftg = 0;
    else
    {
        int32_t cb = LwMul(cftg, SIZEOF(FTG));

        if (cftg > kcftgFneBase && !FAllocPv((void **)&_prgftg, cb, fmemNil, mprNormal))
        {
            _prgftg = _rgftg;
            PushErc(ercFneGeneral);
            AssertThis(0);
            return fFalse;
        }
        CopyPb(prgftg, _prgftg, cb);
        _cftg = cftg;
        for (pftg = _prgftg + _cftg; pftg-- > _prgftg;)
            _CleanFtg(pftg);
    }

    if (pfniDir == pvNil)
    {
        _fesCur.fni.SetNil();
    }
    else
    {
        STN stn;

        _fesCur.fni = *pfniDir;

        stn = PszLit("");
        if (!_fesCur.fni._FChangeLeaf(&stn))
        {
            PushErc(ercFneGeneral);
            _Free();
            AssertThis(0);
            return fFalse;
        }
    }
    _fesCur.it_init = false;
    _fRecurse = FPure(grffne & ffneRecurse);
    _fInited = fTrue;
    AssertThis(0);
    return fTrue;
}

/***************************************************************************
    Get the next FNI in the enumeration.
***************************************************************************/
bool FNE::FNextFni(FNI *pfni, uint32_t *pgrffneOut, uint32_t grffneIn)
{
    AssertThis(0);
    AssertVarMem(pfni);
    AssertNilOrVarMem(pgrffneOut);
    STN stn;
    bool fT;
    int32_t fvol;
    int32_t err;
    FTG *pftg;
    fs::path basepath;

    if (!_fInited)
    {
        Bug("must initialize the FNE before using it!");
        return fFalse;
    }

    if (grffneIn & ffneSkipDir)
    {
        // skip the rest of the stuff in this dir
        if (!_FPop())
            goto LDone;
    }

    // directory or file
    basepath = fs::path(_fesCur.fni._stnFile.Psz());
    for (;;)
    {
        fs::directory_entry de;

        if (_fesCur.fni._stnFile.Cch() == 0)
            goto LDone;

        if (_fesCur.it_init == false)
        {
            STN stn;

            _fesCur.it = fs::directory_iterator(_fesCur.fni._stnFile.Psz());
            _fesCur.it_init = true;
        }
        else
        {
            _fesCur.it++;
        }

        if (_fesCur.it == fs::end(_fesCur.it))
        {
            goto LPop;
        }

        de = *_fesCur.it;

        stn.SetSz(fs::relative(de.path(), basepath).c_str());
        *pfni = _fesCur.fni;
        if (de.is_directory())
        {
            if (stn.FEqualSz(PszLit(".")) || stn.FEqualSz(PszLit("..")))
                continue;
            AssertDo(pfni->_FChangeLeaf(pvNil), 0);
            fT = pfni->FDownDir(&stn, ffniMoveToDir);
        }
        else
            fT = pfni->_FChangeLeaf(&stn);
        if (!fT)
        {
            PushErc(ercFneGeneral);
            continue;
        }

        if (_cftg == 0)
            goto LGotOne;
        for (pftg = _prgftg + _cftg; pftg-- > _prgftg;)
        {
            if (*pftg == pfni->_ftg)
                goto LGotOne;
        }
    }
    Bug("How did we fall through to here?");

LPop:
    if (pvNil == _pglfes || _pglfes->IvMac() == 0)
    {
    LDone:
        _Free();
        AssertThis(0);
        return fFalse;
    }

    // we're about to pop a directory, so send the current directory back
    // with ffnePost
    if (pvNil != pgrffneOut)
        *pgrffneOut = ffnePost;
    *pfni = _fesCur.fni;
    AssertDo(pfni->_FChangeLeaf(pvNil), 0);
    AssertDo(_FPop(), 0);
    AssertPo(pfni, ffniDir);
    AssertThis(0);
    return fTrue;

LGotOne:
    AssertPo(pfni, ffniFile | ffniDir);
    if (pvNil != pgrffneOut)
        *pgrffneOut = ffnePre | ffnePost;

    if (_fRecurse && pfni->_ftg == kftgDir)
    {
        if ((pvNil != _pglfes || pvNil != (_pglfes = GL::PglNew(SIZEOF(FES), 5))) && _pglfes->FPush(&_fesCur))
        {
            // set up the new fes
            _fesCur.fni = *pfni;
            stn = PszLit("*");
            if (!_fesCur.fni._FChangeLeaf(&stn))
            {
                AssertDo(_pglfes->FPop(&_fesCur), 0);
            }
            else
            {
                _fesCur.it = fs::end(_fesCur.it);
                if (pvNil != pgrffneOut)
                    *pgrffneOut = ffnePre;
            }
        }
        else
            PushErc(ercFneGeneral);
    }
    AssertThis(0);
    return fTrue;
}

/***************************************************************************
    Pop a state in the FNE.
***************************************************************************/
bool FNE::_FPop(void)
{
    AssertBaseThis(0);

    _fesCur.it == fs::end(_fesCur.it);
    return pvNil != _pglfes && _pglfes->FPop(&_fesCur);
}

#ifdef DEBUG
/***************************************************************************
    Assert the validity of a FNE.
***************************************************************************/
void FNE::AssertValid(uint32_t grf)
{
    FNE_PAR::AssertValid(0);
    if (_fInited)
    {
        AssertNilOrPo(_pglfes, 0);
        AssertIn(_cftg, 0, kcbMax);
        AssertPvCb(_prgftg, LwMul(SIZEOF(FTG), _cftg));
        Assert((_cftg <= kcftgFneBase) == (_prgftg == _rgftg), "wrong _prgftg");
    }
    else
        Assert(_pglfes == pvNil, 0);
}

/***************************************************************************
    Mark memory for the FNE.
***************************************************************************/
void FNE::MarkMem(void)
{
    AssertValid(0);
    FNE_PAR::MarkMem();
    if (_prgftg != _rgftg)
        MarkPv(_prgftg);
    MarkMemObj(_pglfes);
}
#endif // DEBUG
