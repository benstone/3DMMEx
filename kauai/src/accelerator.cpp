
/***************************************************************************
    Author: Ben Stone
    Project: Kauai

    Accelerator table implementation

***************************************************************************/

#include "frame.h"
#include "accelerator.h"

ASSERTNAME

// Accelerator table entry: maps a keycode + flags to a command ID
struct CmdKey
{
    union {
        struct
        {
            int32_t vk;      // Keycode
            int32_t grfcust; // Flags for keycode
        };
        int64_t vkgrfcust; // Combination of keycode and flags
    };
    int32_t cid; // Command ID to enqueue
};

RTCLASS(ATBL)

BEGIN_CMD_MAP(ATBL, CMH)
ON_CID_ALL(cidKey, &ATBL::FCmdKey, pvNil)
END_CMD_MAP_NIL()

bool ATBL::FCmdKey(PCMD pcmd)
{
    AssertThis(0);
    AssertPo(pcmd, 0);

    if (pcmd == pvNil)
        return fFalse;

    Assert(pcmd->cid == cidKey, "wrong message type");

    // Check if there is a keyboard accelerator that matches this key
    PCMD_KEY pcmdkey = (PCMD_KEY)pcmd;
    int32_t cid;
    if (_FFindCmdKey(pcmdkey->vk, pcmdkey->grfcust, &cid, pvNil))
    {
        // Enqueue a message with the new command ID
        CMD cmd = *pcmd;
        cmd.cid = cid;
        _pcex->EnqueueCmd(&cmd);
        return fTrue;
    }
    return fFalse;
}

PATBL ATBL::PatblNew(int32_t hid, PCEX pcex)
{
    AssertPo(pcex, 0);

    PATBL patbl = pvNil;
    if ((patbl = NewObj ATBL(hid, pcex)) == pvNil)
        return pvNil;

    return patbl;
}

ATBL::ATBL(int32_t hid, PCEX pcex) : CMH(hid)
{
    _pglCmdKey = pvNil;

    _pcex = pcex;
    if (_pcex != pvNil)
    {
        _pcex->AddRef();
    }

    AssertThis(0);
}

ATBL::~ATBL()
{
    ReleasePpo(&_pcex);
    ReleasePpo(&_pglCmdKey);
}

#ifdef DEBUG
void ATBL::AssertValid(uint32_t grf)
{
    ATBL_PAR::AssertValid(0);
    AssertPo(_pcex, 0);
    AssertNilOrPo(_pglCmdKey, 0);
}

void ATBL::MarkMem(void)
{
    AssertValid(0);
    ATBL_PAR::MarkMem();
    MarkMemObj(_pcex);
    MarkMemObj(_pglCmdKey);
}
#endif // DEBUG

bool ATBL::_FFindCmdKey(int32_t vk, int32_t grfcust, int32_t *pcid, int32_t *picmdkey)
{
    AssertThis(0);
    AssertNilOrVarMem(pcid);
    AssertNilOrVarMem(picmdkey);
    int32_t ivMin, ivLim, iv;
    CmdKey cmdkeyT;
    CmdKey cmdkeyCur;

    cmdkeyT.vk = vk;
    cmdkeyT.grfcust = grfcust;

    if (pvNil == _pglCmdKey)
    {
        if (picmdkey != pvNil)
            *picmdkey = 0;
        TrashVar(pcid);
        return fFalse;
    }

    // Find the key in the accelerator table
    for (ivMin = 0, ivLim = _pglCmdKey->IvMac(); ivMin < ivLim;)
    {
        iv = (ivMin + ivLim) / 2;
        _pglCmdKey->Get(iv, &cmdkeyCur);
        if (cmdkeyCur.vkgrfcust < cmdkeyT.vkgrfcust)
            ivMin = iv + 1;
        else if (cmdkeyCur.vkgrfcust > cmdkeyT.vkgrfcust)
            ivLim = iv;
        else
        {
            // Found it
            if (pvNil != picmdkey)
                *picmdkey = iv;
            if (pvNil != pcid)
                *pcid = cmdkeyCur.cid;
            return fTrue;
        }
    }

    // Not found
    if (pvNil != picmdkey)
        *picmdkey = ivMin;
    TrashVar(pcid);
    return fFalse;
}

bool ATBL::FAddCmdKey(int32_t vk, int32_t grfcust, int32_t cid)
{
    AssertThis(0);
    int32_t icmdkey;

    CmdKey cmdkey;
    cmdkey.vk = vk;
    cmdkey.grfcust = grfcust;
    cmdkey.cid = cid;

    Assert(cmdkey.cid != cidKey, "Cannot map key command to another key command");
    if (cmdkey.cid == cidKey)
    {
        return fFalse;
    }

    if (_FFindCmdKey(vk, grfcust, pvNil, &icmdkey))
    {
        // Replace the existing item
        _pglCmdKey->Put(icmdkey, &cmdkey);
        return fTrue;
    }

    if (pvNil == _pglCmdKey)
    {
        Assert(icmdkey == 0, 0);
        if (pvNil == (_pglCmdKey = GL::PglNew(SIZEOF(CmdKey))))
            return fFalse;
    }

    return _pglCmdKey->FInsert(icmdkey, &cmdkey);
}
