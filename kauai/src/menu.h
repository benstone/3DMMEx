/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Menu bar management.

***************************************************************************/
#ifndef MENU_H
#define MENU_H

// Menu Bar class
typedef class MUB *PMUB;
#define MUB_PAR BASE
#define kclsMUB KLCONST3('M', 'U', 'B')
class MUB : public MUB_PAR
{
    RTCLASS_DEC
    MARKMEM

  private:
#ifdef MAC
    // System Menu
    typedef MenuInfo SMU;

    // System Menu Bar
    struct SMB
    {
        ushort cmid;
        ushort rgmid[1];
    };

    // Menu Item
    struct MNI
    {
        int32_t cid;
        int32_t lw0;
    };

    // Menu
    struct MNU
    {
        int32_t mid;
        SMU **hnsmu;
        PGL pglmni;
    };

    // menu list
    struct MLST
    {
        int32_t imnu;
        int32_t imniBase;
        int32_t cmni;
        int32_t cid;
        bool fSeparator;
    };

    HN _hnmbar;
    PGL _pglmnu;
    PGL _pglmlst; // menu lists

    bool _FInsertMni(int32_t imnu, int32_t imni, int32_t cid, int32_t lw0, PSTN pstn);
    void _DeleteMni(int32_t imnu, int32_t imni);
    bool _FFindMlst(int32_t imnu, int32_t imni, MLST *pmlst = pvNil, int32_t *pimlst = pvNil);
    bool _FGetCmdFromCode(int32_t lwCode, CMD *pcmd);
    void _Free(void);
    bool _FFetchRes(uint32_t ridMenuBar);
#endif // MAC

#ifdef KAUAI_WIN32
    // menu list
    struct MLST
    {
        HMENU hmenu;
        int32_t imniBase;
        int32_t wcidList;
        int32_t cid;
        bool fSeparator;
        PGL pgllw;
    };

    HMENU _hmenu;  // the menu bar
    int32_t _cmnu; // number of menus on the menu bar
    PGL _pglmlst;  // menu lists

    bool _FInitLists(void);
    bool _FFindMlst(int32_t wcid, MLST *pmlst, int32_t *pimlst = pvNil);
    bool _FGetCmdForWcid(int32_t wcid, PCMD pcmd);
#endif // KAUAI_WIN32

  protected:
    MUB(void)
    {
    }

  public:
    ~MUB(void);

    static PMUB PmubNew(uint32_t ridMenuBar);

    virtual void Set(void);
    virtual void Clean(void);

#ifdef MAC
    virtual bool FDoClick(EVT *pevt);
    virtual bool FDoKey(EVT *pevt);
#endif // MAC
#ifdef KAUAI_WIN32
    virtual void EnqueueWcid(int32_t wcid);
#endif // KAUAI_WIN32

    virtual bool FAddListCid(int32_t cid, uintptr_t lw0, PSTN pstn);
    virtual bool FRemoveListCid(int32_t cid, uintptr_t lw0, PSTN pstn = pvNil);
    virtual bool FChangeListCid(int32_t cid, uintptr_t lwOld, PSTN pstnOld, uintptr_t lwNew, PSTN pstnNew);
    virtual bool FRemoveAllListCid(int32_t cid);
};

extern PMUB vpmubCur;

#endif //! MENU_H
