/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    Accelerator table

    The ATBL class is a cross-platform replacement for Win32 accelerator
    tables. Accelerator tables are used to implement keyboard shortcuts.

    The ATBL object will receive cidKey messages and translate them to
    other types of messages. The ATBL object maintains a list of entries
    that map combinations of virtual keycodes and flags (grfcust) to a
    command ID.

***************************************************************************/

#include "frame.h"

#ifndef ACCELERATOR_H
#define ACCELERATOR_H

typedef class ATBL *PATBL;
#define ATBL_PAR CMH
#define kclsATBL KLCONST4('A', 'T', 'B', 'L')
class ATBL : public ATBL_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(ATBL)

  private:
    ATBL(int32_t hid, PCEX pcex);
    virtual ~ATBL();

    // CEX that receives remapped messages
    PCEX _pcex = pvNil;

    // List of keyboard accelerator table entries
    PGL _pglCmdKey = pvNil;

    // Find the given key and flags in the accelerator table
    bool _FFindCmdKey(int32_t vk, int32_t grfcust, int32_t *pcid, int32_t *picmdkey);

  public:
    // Create a new keyboard accelerator table
    static PATBL PatblNew(int32_t hid, PCEX pcex);

    // Add a keyboard shortcut to the accelerator table
    bool FAddCmdKey(int32_t vk, int32_t grfcust, int32_t cid);

    // Handle a key event
    bool FCmdKey(PCMD pcmd);
};

#endif // ACCELERATOR_H