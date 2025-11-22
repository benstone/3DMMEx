/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: Mark Cave-Ayland
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    POSIX picture stub routines.

***************************************************************************/
#include "frame.h"
ASSERTNAME

/***************************************************************************
    Constructor for a picture.
***************************************************************************/
PIC::PIC(void)
{
    _hpic = hNil;
    _rc.Zero();
}

/***************************************************************************
    Destructor for a picture.
***************************************************************************/
PIC::~PIC(void)
{
    AssertBaseThis(0);
}

/***************************************************************************
    Read a picture from a chunky file.  This routine only reads or converts
    OS specific representations with the given chid value.
***************************************************************************/
PPIC PIC::PpicFetch(PCFL pcfl, CTG ctg, CNO cno, CHID chid)
{
    AssertPo(pcfl, 0);
    BLCK blck;
    KID kid;

    if (!pcfl->FFind(ctg, cno))
        return pvNil;
    if (pcfl->FGetKidChidCtg(ctg, cno, chid, kctgMeta, &kid) && pcfl->FFind(kid.cki.ctg, kid.cki.cno, &blck))
    {
        return PpicRead(&blck);
    }

    // REVIEW shonk: convert another type to a MetaFile...
    return pvNil;
}

/***************************************************************************
    Read a picture from a chunky file.  This routine only reads a system
    specific pict (Mac PICT or Windows MetaFile) and its header.
***************************************************************************/
PPIC PIC::PpicRead(PBLCK pblck)
{
    AssertPo(pblck, fblckReadable);

    RawRtn();
    return NULL;
}

/***************************************************************************
    Return the total size on file.
***************************************************************************/
int32_t PIC::CbOnFile(void)
{
    AssertThis(0);

    RawRtn();
    return 0;
}

/***************************************************************************
    Write the meta file (and its header) to the given BLCK.
***************************************************************************/
bool PIC::FWrite(PBLCK pblck)
{
    AssertThis(0);
    AssertPo(pblck, 0);

    RawRtn();
    return fFalse;
}

/***************************************************************************
    Static method to read the file as a native picture (EMF or WMF file).
***************************************************************************/
PPIC PIC::PpicReadNative(FNI *pfni)
{
    AssertPo(pfni, ffniFile);

    RawRtn();
    return NULL;
}
