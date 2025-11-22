/* Copyright (c) Mark Cave-Ayland.
   Licensed under the MIT License. */

/***************************************************************************
    Author: Mark Cave-Ayland
    Project: Kauai
    Reviewed:
    Copyright (c) Mark Cave-Ayland

    Linux specific file management.

***************************************************************************/
#include "util.h"
#include <cstdio>
ASSERTNAME

const ulong kfpError = 0xFFFFFFFF;

/***************************************************************************
    Open or create the file by calling CreateFile.  Returns hBadWin on
    failure.
***************************************************************************/
priv FILE *_HfileOpen(PSZ psz, uint32_t grffil)
{
    const char *mode = (grffil & ffilWriteEnable) ? "wb+" : "rb";

    return std::fopen(psz, mode);
}

/***************************************************************************
    Open or create the file.  If the file is already open, sets the
    permissions according to grffil.
***************************************************************************/
bool FIL::_FOpen(bool fCreate, uint32_t grffil)
{
    AssertBaseThis(0);
    bool fRet = fFalse;
    FILE *fp;

    _mutx.Enter();

    if (_el >= kelCritical)
        goto LRet;

    grffil &= kgrffilPerm;
    if (_fOpen)
    {
        Assert(!fCreate, "can't create an open file");
        if ((~_grffil & grffil) == 0)
        {
            // permissions are already set high enough
            fRet = fTrue;
            goto LRet;
        }
        std::fclose(_fp);
        _fp = NULL;

        // maintain the permissions we had before
        grffil |= _grffil & kgrffilPerm;
    }

    _fp = _HfileOpen(_fni._stnFile.Psz(), grffil);

    if (NULL == _fp)
    {
        // if it was open, re-open it with old permissions
        if (_fOpen)
        {
            _fp = _HfileOpen(_fni._stnFile.Psz(), _grffil);
            if (NULL != _fp)
                goto LRet;
        }
        _fOpen = fFalse;
        _el = kelCritical;
        goto LRet;
    }

    _fOpen = fTrue;
    _fEverOpen = fTrue;
    _grffil = (_grffil & ~kgrffilPerm) | grffil;
    fRet = fTrue;

LRet:
    _mutx.Leave();

    return fRet;
}

/***************************************************************************
    Close the file.
***************************************************************************/
void FIL::_Close(bool fFinal)
{
    AssertBaseThis(0);

    _mutx.Enter();

    if (_fOpen)
    {
        Flush();
        std::fclose(_fp);
        _fOpen = fFalse;
        _fp = NULL;
    }

    if ((_grffil & ffilTemp) && fFinal && _fEverOpen)
    {
        if (std::remove(_fni._stnFile.Psz()))
            Warn("Deleting temp file failed");
    }

    _mutx.Leave();
}

/***************************************************************************
    Flush the file (and its volume?).
***************************************************************************/
void FIL::Flush(void)
{
    AssertThis(0);

    _mutx.Enter();

    if (_fOpen)
        std::fflush(_fp);

    _mutx.Leave();
}

/******************************************    *********************************
    Seek to the given fp - assumes the mutx is already entered.
***************************************************************************/
void FIL::_SetFpPos(FP fpos)
{
    AssertThis(0);

    if (!_fOpen)
        _FOpen(fFalse, _grffil);

    if (_el < kelSeek && std::fseek(_fp, fpos, SEEK_SET))
    {
        PushErc(ercFileGeneral);
        _el = kelSeek;
    }
}

/***************************************************************************
    Set the length of the file.  This doesn't zero the appended portion.
***************************************************************************/
bool FIL::FSetFpMac(FP fpos)
{
    AssertThis(0);
    AssertIn(fpos, 0, kcbMax);
    bool fRet;
    FP curfpos, endfpos;
    const char buf[1] = {'\0'};
    int i;

    _mutx.Enter();

    curfpos = std::ftell(_fp);
    Assert(_grffil & ffilWriteEnable, "can't write to read only file");
    endfpos = FpMac();
    Assert((fpos - endfpos) > 0, "can't truncate file");
    _SetFpPos(endfpos);

    if (_el < kelWrite)
    {
        _fWrote = fTrue;
        for (i = 0; i < fpos - endfpos; i++)
        {
            if (!std::fwrite(buf, 1, 1, _fp))
            {
                PushErc(ercFileGeneral);
                _el = kelWrite;
            }
        }
    }
    fRet = _el < kelWrite;
    _SetFpPos(curfpos);

    _mutx.Leave();

    return fRet;
}

/***************************************************************************
    Return the length of the file.
***************************************************************************/
FP FIL::FpMac(void)
{
    AssertThis(0);
    FP fpos;

    _mutx.Enter();

    if (!_fOpen)
        _FOpen(fFalse, _grffil);

    if (_el < kelSeek && (std::fseek(_fp, 0, SEEK_END)))
    {
        PushErc(ercFileGeneral);
        _el = kelSeek;
    }

    fpos = std::ftell(_fp);
    if (_el >= kelSeek)
        fpos = 0;

    _mutx.Leave();

    return fpos;
}

/***************************************************************************
    Read a block from the file.
***************************************************************************/
bool FIL::FReadRgb(void *pv, int32_t cb, FP fp)
{
    AssertThis(0);
    AssertIn(cb, 0, kcbMax);
    AssertIn(fp, 0, klwMax);
    AssertPvCb(pv, cb);

    size_t cbT;
    bool fRet = fFalse;

    if (cb <= 0)
        return fTrue;

    _mutx.Enter();

    if (!_fOpen)
        _FOpen(fFalse, _grffil);

    Debug(FP dfp = FpMac() - fp;)

        _SetFpPos(fp);
    if (_el >= kelRead)
        goto LRet;

    Assert(dfp >= cb, "read past EOF");
    if (!(cbT = std::fread(pv, 1, cb, _fp)) || cb != cbT)
    {
        PushErc(ercFileGeneral);
        _el = kelRead;
        goto LRet;
    }

    fRet = fTrue;

LRet:
    _mutx.Leave();
    return fRet;
}

/***************************************************************************
    Write a block to the file.
***************************************************************************/
bool FIL::FWriteRgb(const void *pv, int32_t cb, FP fp)
{
    AssertThis(0);
    AssertIn(cb, 0, kcbMax);
    AssertIn(fp, 0, klwMax);
    AssertPvCb(pv, cb);

    size_t cbT;
    bool fRet = fFalse;

    if (cb <= 0)
        return fTrue;

    _mutx.Enter();

    Assert(_grffil & ffilWriteEnable, "can't write to read only file");

    if (!_fOpen)
        _FOpen(fFalse, _grffil);

    _SetFpPos(fp);
    if (_el >= kelWrite)
        goto LRet;

    _fWrote = fTrue;
    if (!(cbT = std::fwrite(pv, 1, cb, _fp)) || cb != cbT)
    {
        PushErc(ercFileGeneral);
        _el = kelWrite;
        goto LRet;
    }

    fRet = fTrue;

LRet:
    _mutx.Leave();
    return fRet;
}

/***************************************************************************
    Swap the names of the two files.  They should be in the same directory.
***************************************************************************/
bool FIL::FSwapNames(PFIL pfil)
{
    AssertThis(0);
    AssertPo(pfil, 0);
    FNI fni;
    FNI fniT;
    bool fRet = fFalse;

    if (this == pfil)
    {
        Bug("Why are you calling FSwapNames on the same file?");
        return fTrue;
    }

    _mutx.Enter();
    pfil->_mutx.Enter();

    Assert(_fni.FSameDir(&pfil->_fni), "trying to change directories with FSwapNames");

    fni = pfil->_fni;
    if (!fni.FGetUnique(fni.Ftg()))
        goto LRet;

    if (!_fni.FRename(&fni))
        goto LFail;
    if (!pfil->_fni.FRename(&_fni))
        goto LRenameFail;
    if (!fni.FRename(&pfil->_fni))
    {
        if (!_fni.FRename(&pfil->_fni))
        {
            Bug("rename failure");
            pfil->_fni = _fni;
            _fni = fni;
            goto LFail;
        }

    LRenameFail:
        if (!fni.FRename(&_fni))
        {
            Bug("rename failure");
            _fni = fni;
        }
        goto LFail;
    }

    fni = _fni;
    _fni = pfil->_fni;
    pfil->_fni = fni;
    fRet = fTrue;

LFail:
LRet:
    _mutx.Leave();
    pfil->_mutx.Leave();

    if (!fRet)
        PushErc(ercFileSwapNames);

    AssertThis(0);
    AssertPo(pfil, 0);

    return fRet;
}

/***************************************************************************
    Rename a file.  The new fni should be on the same volume.
    This may fail without an error code being set.
***************************************************************************/
bool FIL::FRename(FNI *pfni)
{
    AssertThis(0);
    AssertPo(pfni, ffniFile);
    FNI fni;
    bool fRet = fFalse;

    _mutx.Enter();

    Assert(_fni.FSameDir(pfni), "trying to change directories with FRename");

    fRet = _fni.FRename(pfni);
    if (fRet)
        _fni = *pfni;

    _mutx.Leave();

    if (!fRet)
        PushErc(ercFileRename);

    AssertThis(0);
    return fRet;
}
