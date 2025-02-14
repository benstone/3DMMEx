/**
 * Tests ported from Kauai test.cpp
 **/
#include <gtest/gtest.h>

#include "util.h"
ASSERTNAME

#ifdef DEBUG
/**
 * @brief Kauai assertion handler that causes a Google Test failure on assert
 *
 * @param pszsFile Source file name
 * @param lwLine Source line number
 * @param pszsMsg Assertion message
 * @param pv Optional data
 * @param cb Size of optional data
 * @return fFalse to not break into the debugger
 */
bool FAssertProc(PSZS pszsFile, long lwLine, PSZS pszsMsg, void *pv, long cb)
{
    ADD_FAILURE_AT(pszsFile, lwLine) << pszsMsg;
    return fFalse;
}

/**
 * @brief Kauai warning log handler
 *
 * @param pszsFile Source file name
 * @param lwLine Source line number
 * @param pszsMsg Warning message
 */
void WarnProc(PSZS pszsFile, long lwLine, PSZS pszsMsg)
{
    // TODO: log warning messages somewhere
}
#endif // DEBUG

TEST(KauaiTests, TestInt)
{
    EXPECT_EQ(SwHigh(0x12345678), (short)0x1234);
    EXPECT_EQ(SwHigh(0xABCDEF01), (short)0xABCD);
    EXPECT_EQ(SwLow(0x12345678), (short)0x5678);
    EXPECT_EQ(SwLow(0xABCDEF01), (short)0xEF01);

    EXPECT_EQ(LwHighLow(0x1234, 0x5678), 0x12345678);
    EXPECT_EQ(LwHighLow((short)0xABCD, (short)0xEF01), 0xABCDEF01);

    EXPECT_EQ(BHigh(0x1234), 0x12);
    EXPECT_EQ(BHigh((short)0xABCD), 0xAB);
    EXPECT_EQ(BLow(0x1234), 0x34);
    EXPECT_EQ(BLow((short)0xABCD), 0xCD);

    EXPECT_EQ(SwHighLow(0x12, 0x56), (short)0x1256);
    EXPECT_EQ(SwHighLow(0xAB, 0xEF), (short)0xABEF);

    EXPECT_EQ(SwMin(kswMax, kswMin), kswMin);
    EXPECT_EQ(SwMin(kswMin, kswMax), kswMin);
    EXPECT_EQ(SwMax(kswMax, kswMin), kswMax);
    EXPECT_EQ(SwMax(kswMin, kswMax), kswMax);

    EXPECT_EQ(SuMin(ksuMax, 0), 0);
    EXPECT_EQ(SuMin(0, ksuMax), 0);
    EXPECT_EQ(SuMax(ksuMax, 0), ksuMax);
    EXPECT_EQ(SuMax(0, ksuMax), ksuMax);

    EXPECT_EQ(LwMin(klwMax, klwMin), klwMin);
    EXPECT_EQ(LwMin(klwMin, klwMax), klwMin);
    EXPECT_EQ(LwMax(klwMax, klwMin), klwMax);
    EXPECT_EQ(LwMax(klwMin, klwMax), klwMax);

    EXPECT_EQ(LuMin(kluMax, 0), 0);
    EXPECT_EQ(LuMin(0, kluMax), 0);
    EXPECT_EQ(LuMax(kluMax, 0), kluMax);
    EXPECT_EQ(LuMax(0, kluMax), kluMax);

    EXPECT_EQ(SwAbs(kswMax), kswMax);
    EXPECT_EQ(SwAbs(kswMin), -kswMin);
    EXPECT_EQ(LwAbs(klwMax), klwMax);
    EXPECT_EQ(LwAbs(klwMin), -klwMin);

    EXPECT_EQ(LwMulSw(kswMax, kswMax), 0x3FFF0001);
    EXPECT_EQ(LwMulSw(kswMin, kswMin), 0x3FFF0001);
    EXPECT_EQ(LwMulSw(kswMax, kswMin), -0x3FFF0001);

    EXPECT_EQ(LwMulDiv(klwMax, klwMax, klwMin), klwMin);
    EXPECT_EQ(LwMulDiv(klwMax, klwMin, klwMax), klwMin);

    EXPECT_EQ(CbRoundToLong(0), 0);
    EXPECT_EQ(CbRoundToLong(1), 4);
    EXPECT_EQ(CbRoundToLong(2), 4);
    EXPECT_EQ(CbRoundToLong(3), 4);
    EXPECT_EQ(CbRoundToLong(4), 4);
    EXPECT_EQ(CbRoundToLong(5), 8);

    EXPECT_EQ(CbRoundToShort(0), 0);
    EXPECT_EQ(CbRoundToShort(1), 2);
    EXPECT_EQ(CbRoundToShort(2), 2);
    EXPECT_EQ(CbRoundToShort(3), 4);
    EXPECT_EQ(CbRoundToShort(4), 4);
    EXPECT_EQ(CbRoundToShort(5), 6);

    EXPECT_EQ(LwGcd(10000, 350), 50);
    EXPECT_EQ(LwGcd(10000, -560), 80);

    EXPECT_EQ(FcmpCompareFracs(50000, 30000, 300000, 200000), fcmpGt);
    EXPECT_EQ(FcmpCompareFracs(-50000, 30000, -300000, 200000), fcmpLt);
    EXPECT_EQ(FcmpCompareFracs(-50000, 30000, 300000, 200000), fcmpLt);
    EXPECT_EQ(FcmpCompareFracs(50000, 30000, -300000, 200000), fcmpGt);
    EXPECT_EQ(FcmpCompareFracs(50000, 30000, 500000, 300000), fcmpEq);
    EXPECT_EQ(FcmpCompareFracs(0x1FFF0000, 0x10, 0x11000000, 0x10), fcmpGt);
}

TEST(KauaiTests, TestMem)
{
#define kchq 18
    HQ rghq[kchq];
    HQ hqT, hq;
    long cb, ihq;

    FillPb(rghq, SIZEOF(rghq), 0);

    for (ihq = 0; ihq < kchq; ihq++)
    {
        cb = (1L << ihq) - 1 + ihq;

        ASSERT_TRUE(FAllocHq(&hq, cb, fmemNil, mprDebug)) << "HqAlloc failed";

        rghq[ihq] = hq;
        EXPECT_EQ(CbOfHq(hq), cb);

        FillPb(QvFromHq(hq), cb, (byte)cb);
        if (cb > 0)
        {
            EXPECT_EQ(*(byte *)QvFromHq(hq), (byte)cb);
            EXPECT_EQ(*(byte *)PvAddBv(QvFromHq(hq), cb - 1), (byte)cb);
        }

        EXPECT_EQ(PvLockHq(hq), QvFromHq(hq));
        if (!FCopyHq(hq, &hqT, mprDebug))
            FAIL() << "FCopyHq failed";
        else
        {
            EXPECT_EQ(CbOfHq(hqT), cb);
            if (cb > 0)
            {
                EXPECT_EQ(*(byte *)QvFromHq(hqT), (byte)cb);
                EXPECT_EQ(*(byte *)PvAddBv(QvFromHq(hqT), cb - 1), (byte)cb);
            }
            FreePhq(&hqT);
        }
        EXPECT_EQ(hqT, hqNil);
        FreePhq(&hqT);

        UnlockHq(hq);
    }

    for (ihq = 0; ihq < kchq; ihq++)
    {
        hq = rghq[ihq];
        if (hqNil == hq)
            break;
        cb = CbOfHq(hq);
        if (!FResizePhq(&rghq[ihq], 2 * cb, fmemClear, mprDebug))
        {
            FAIL() << "FResizePhq failed";
            break;
        }
        hq = rghq[ihq];
        if (cb > 0)
        {
            EXPECT_EQ(*(byte *)QvFromHq(hq), (byte)cb);
            EXPECT_EQ(*(byte *)PvAddBv(QvFromHq(hq), cb - 1), (byte)cb);
            EXPECT_EQ(*(byte *)PvAddBv(QvFromHq(hq), cb), 0);
            EXPECT_EQ(*(byte *)PvAddBv(QvFromHq(hq), 2 * cb - 1), 0);
        }
    }

    for (ihq = 0; ihq < kchq; ihq++)
    {
        if (hqNil != rghq[ihq])
        {
            cb = (1L << (kchq - 1 - ihq)) - 1 + (kchq - 1 - ihq);
            EXPECT_TRUE(FResizePhq(&rghq[ihq], cb, fmemNil, mprDebug)) << "FResizePhq failed";
        }
        FreePhq(&rghq[ihq]);
    }
}

TEST(KauaiTests, TestGl)
{
    short sw;
    long isw;
    short *qsw;
    PGL pglsw;

    pglsw = GL::PglNew(SIZEOF(short));
    if (pvNil == pglsw)
    {
        Bug("PglNew failed");
        return;
    }

    for (sw = 0; sw < 10; sw++)
    {
        EXPECT_TRUE(pglsw->FAdd(&sw, &isw));
        EXPECT_EQ(isw, sw);
    }
    EXPECT_EQ(pglsw->IvMac(), 10);

    for (isw = 0; isw < 10; isw++)
    {
        qsw = (short *)pglsw->QvGet(isw);
        EXPECT_EQ(*qsw, isw);
        pglsw->Get(isw, &sw);
        EXPECT_EQ(sw, isw);
    }

    for (isw = 10; isw > 0;)
        pglsw->Delete(isw -= 2);
    EXPECT_EQ(pglsw->IvMac(), 5);

    for (isw = 0; isw < 5; isw++)
    {
        pglsw->Get(isw, &sw);
        EXPECT_EQ(sw, isw * 2 + 1);
        sw = (short)isw * 100;
        pglsw->Put(isw, &sw);
        qsw = (short *)pglsw->QvGet(isw);
        EXPECT_EQ(*qsw, isw * 100);
        *qsw = (short)isw;
    }

    EXPECT_EQ(pglsw->IvMac(), 5);
    EXPECT_TRUE(pglsw->FEnsureSpace(0, fgrpShrink));
    EXPECT_EQ(pglsw->IvMac(), 5);

    for (isw = 5; isw-- != 0;)
    {
        sw = (short)isw;
        pglsw->FInsert(isw, &sw);
    }

    EXPECT_EQ(pglsw->IvMac(), 10);
    for (isw = 10; isw-- != 0;)
    {
        pglsw->Get(isw, &sw);
        EXPECT_EQ(sw, isw / 2);
    }

    ReleasePpo(&pglsw);
}

TEST(KauaiTests, TestFni)
{
    FNI fni1, fni2;
    STN stn1, stn2, stn3;

    EXPECT_TRUE(fni1.FGetTemp());
    EXPECT_EQ(fni1.Ftg(), vftgTemp);
    EXPECT_TRUE(!fni1.FDir());
    fni2 = fni1;
    fni1.GetLeaf(&stn3);
    fni2.GetLeaf(&stn2);
    EXPECT_TRUE(stn3.FEqual(&stn2));

    EXPECT_TRUE(fni1.FSetLeaf(pvNil, kftgDir));
    EXPECT_TRUE(fni1.FDir());
    EXPECT_EQ(fni1.Ftg(), kftgDir);

    EXPECT_TRUE(fni1.FUpDir(&stn1, ffniNil));
    EXPECT_TRUE(fni1.FUpDir(&stn2, ffniMoveToDir));
    EXPECT_TRUE(stn1.FEqual(&stn2));
    EXPECT_TRUE(!fni1.FSameDir(&fni2));
    EXPECT_TRUE(!fni1.FEqual(&fni2));
    EXPECT_EQ(fni1.Ftg(), kftgDir);
    EXPECT_TRUE(fni1.FDownDir(&stn1, ffniNil));
    EXPECT_TRUE(!fni1.FSameDir(&fni2));
    EXPECT_TRUE(fni1.FDownDir(&stn1, ffniMoveToDir));
    EXPECT_TRUE(fni1.FSameDir(&fni2));
    EXPECT_TRUE(fni1.FSetLeaf(&stn3, vftgTemp));

    EXPECT_TRUE(fni1.FEqual(&fni2));
    EXPECT_EQ(fni1.TExists(), tNo);
    EXPECT_TRUE(fni2.FSetLeaf(pvNil, kftgDir));
    EXPECT_TRUE(fni2.FGetUnique(vftgTemp));
    EXPECT_TRUE(!fni1.FEqual(&fni2));
}

TEST(KauaiTests, TestFil)
{
    PFIL pfil;
    FNI fni;

    ASSERT_TRUE(fni.FGetTemp());
    pfil = FIL::PfilCreate(&fni);
    AssertPo(pfil, 0);
    EXPECT_TRUE(pfil->FSetFpMac(100));
    EXPECT_EQ(pfil->FpMac(), 100);
    EXPECT_TRUE(pfil->FWriteRgb(&fni, SIZEOF(fni), 0));
    pfil->SetTemp(fTrue);
    pfil->Mark();
    ReleasePpo(&pfil);

    FIL::CloseUnmarked();
    FIL::ClearMarks();
    FIL::CloseUnmarked();
}

TEST(KauaiTests, TestGg)
{
    PGG pgg;
    ulong grf;
    long cb, iv;
    byte *qb;
    PSZ psz = PszLit("0123456789ABCDEFG");
    achar rgch[100];

    EXPECT_TRUE((pgg = GG::PggNew(0)) != pvNil);
    for (iv = 0; iv < 10; iv++)
    {
        EXPECT_TRUE(pgg->FInsert(iv / 2, iv + 1, psz));
    }
    EXPECT_TRUE(pgg->FAdd(16, &iv, psz));
    EXPECT_EQ(iv, 10);
    EXPECT_EQ(pgg->IvMac(), 11);

    grf = 0;
    for (iv = pgg->IvMac(); iv--;)
    {
        cb = pgg->Cb(iv);
        qb = (byte *)pgg->QvGet(iv);
        EXPECT_TRUE(FEqualRgb(psz, qb, cb));
        grf |= 1L << cb;
        if (cb & 1)
            pgg->Delete(iv);
    }
    EXPECT_EQ(grf, 0x000107FE);

    grf = 0;
    for (iv = pgg->IvMac(); iv--;)
    {
        cb = pgg->Cb(iv);
        EXPECT_TRUE(!(cb & 1));
        pgg->Get(iv, rgch);
        qb = (byte *)pgg->QvGet(iv);
        EXPECT_TRUE(FEqualRgb(rgch, qb, cb));
        EXPECT_TRUE(FEqualRgb(rgch, psz, cb));
        grf |= 1L << cb;
        CopyPb(psz, rgch + cb, cb);
        EXPECT_TRUE(pgg->FPut(iv, cb + cb, rgch));
    }
    EXPECT_EQ(grf, 0x00010554);

    grf = 0;
    for (iv = pgg->IvMac(); iv--;)
    {
        cb = pgg->Cb(iv);
        EXPECT_TRUE(!(cb & 3));
        cb /= 2;
        grf |= 1L << cb;
        pgg->DeleteRgb(iv, LwMin(cb, iv), cb);

        qb = (byte *)pgg->QvGet(iv);
        EXPECT_TRUE(FEqualRgb(psz, qb, cb));
    }
    EXPECT_EQ(grf, 0x00010554);
    ReleasePpo(&pgg);
}

TEST(KauaiTests, TestCfl)
{
    enum
    {
        relPaul,
        relMarge,
        relTig,
        relCarl,
        relPriscilla,
        relGreg,
        relShon,
        relClaire,
        relMike,
        relStephen,
        relBaby,
        relCathy,
        relJoshua,
        relRachel,
        relLim
    };

    struct EREL
    {
        CTG ctg;
        CNO cno;
        PSZ psz;
        short relPar1, relPar2;
    };

    const CTG kctgLan = 0x41414141;
    const CTG kctgKatz = 0x42424242;
    const CTG kctgSandy = 0x43434343;
    EREL dnrel[relLim] = {
        {kctgLan, 0, PszLit("Paul"), relLim, relLim},         {kctgLan, 0, PszLit("Marge"), relLim, relLim},
        {kctgLan, 0, PszLit("Tig"), relPaul, relMarge},       {kctgKatz, 0, PszLit("Carl"), relLim, relLim},
        {kctgKatz, 0, PszLit("Priscilla"), relLim, relLim},   {kctgKatz, 0, PszLit("Greg"), relCarl, relPriscilla},
        {kctgKatz, 0, PszLit("Shon"), relCarl, relPriscilla}, {kctgKatz, 0, PszLit("Claire"), relPaul, relMarge},
        {kctgKatz, 0, PszLit("Mike"), relCarl, relPriscilla}, {kctgKatz, 0, PszLit("Stephen"), relGreg, relLim},
        {kctgKatz, 0, PszLit("Baby"), relShon, relClaire},    {kctgSandy, 0, PszLit("Cathy"), relCarl, relPriscilla},
        {kctgSandy, 0, PszLit("Joshua"), relCathy, relLim},   {kctgSandy, 0, PszLit("Rachel"), relCathy, relLim},
    };

    FNI fni, fniDst;
    PCFL pcfl, pcflDst;
    BLCK blck;
    short rel;
    long icki;
    CNO cno;
    CKI cki;
    EREL *perel, *perelPar;
    STN stn;
    achar rgch[kcchMaxSz];

    ASSERT_TRUE(fni.FGetTemp()) << "could not create temporary file";

    EXPECT_TRUE((pcfl = CFL::PcflCreate(&fni, fcflNil)) != pvNil);
    EXPECT_TRUE(fniDst.FGetTemp());
    EXPECT_TRUE((pcflDst = CFL::PcflCreate(&fniDst, fcflNil)) != pvNil);

    for (rel = 0; rel < relLim; rel++)
    {
        perel = &dnrel[rel];
        EXPECT_TRUE(pcfl->FAddPv(perel->psz, CchSz(perel->psz), perel->ctg, &perel->cno));
        stn = perel->psz;
        EXPECT_TRUE(pcfl->FSetName(perel->ctg, perel->cno, &stn));
        if (perel->relPar1 < relLim)
        {
            perelPar = &dnrel[perel->relPar1];
            EXPECT_TRUE(pcfl->FAdoptChild(perelPar->ctg, perelPar->cno, perel->ctg, perel->cno));
        }
        if (perel->relPar2 < relLim)
        {
            perelPar = &dnrel[perel->relPar2];
            EXPECT_TRUE(pcfl->FAdoptChild(perelPar->ctg, perelPar->cno, perel->ctg, perel->cno));
        }
        EXPECT_TRUE(pcfl->FCopy(perel->ctg, perel->cno, pcflDst, &cno)) << "copy failed";
    }
    EXPECT_EQ(pcfl->Ccki(), 14);
    for (rel = 0; rel < relLim; rel++)
    {
        perel = &dnrel[rel];
        pcfl->FGetName(perel->ctg, perel->cno, &stn);
        EXPECT_TRUE(FEqualRgb(stn.Prgch(), perel->psz, stn.Cch()));
        EXPECT_TRUE(pcfl->FFind(perel->ctg, perel->cno, &blck));
        EXPECT_TRUE(blck.FRead(rgch));
        EXPECT_TRUE(FEqualRgb(rgch, perel->psz, CchSz(perel->psz) * SIZEOF(achar)));
    }

    // copy all the chunks - they should already be there, but this
    // should set up all the child links
    for (rel = 0; rel < relLim; rel++)
    {
        perel = &dnrel[rel];
        EXPECT_TRUE(pcfl->FCopy(perel->ctg, perel->cno, pcflDst, &cno)) << "copy failed";
    }
    AssertPo(pcflDst, fcflFull);

    // this should delete relShon, but not relBaby
    perelPar = &dnrel[relCarl];
    perel = &dnrel[relShon];
    pcfl->DeleteChild(perelPar->ctg, perelPar->cno, perel->ctg, perel->cno);
    perelPar = &dnrel[relPriscilla];
    pcfl->DeleteChild(perelPar->ctg, perelPar->cno, perel->ctg, perel->cno);
    EXPECT_EQ(pcfl->Ccki(), 13);

    // this should delete relGreg and relStephen
    perelPar = &dnrel[relCarl];
    perel = &dnrel[relGreg];
    pcfl->DeleteChild(perelPar->ctg, perelPar->cno, perel->ctg, perel->cno);
    perelPar = &dnrel[relPriscilla];
    pcfl->DeleteChild(perelPar->ctg, perelPar->cno, perel->ctg, perel->cno);
    EXPECT_EQ(pcfl->Ccki(), 11);

    // this should delete relCarl, relPriscilla, relCathy, relJoshua,
    // relRachel and relMike
    pcfl->Delete(perelPar->ctg, perelPar->cno);
    perelPar = &dnrel[relCarl];
    pcfl->Delete(perelPar->ctg, perelPar->cno);
    EXPECT_EQ(pcfl->Ccki(), 5);

    for (icki = 0; pcfl->FGetCki(icki, &cki); icki++)
    {
        EXPECT_TRUE(pcfl->FGetName(cki.ctg, cki.cno, &stn));
        EXPECT_TRUE(pcfl->FFind(cki.ctg, cki.cno, &blck));
        EXPECT_TRUE(blck.FRead(rgch));
        EXPECT_TRUE(FEqualRgb(rgch, stn.Prgch(), stn.Cch() * SIZEOF(achar)));
        EXPECT_EQ(stn.Cch() * SIZEOF(achar), blck.Cb());
    }

    // copy all the chunks back
    for (icki = 0; pcflDst->FGetCki(icki, &cki); icki++)
    {
        EXPECT_TRUE(pcflDst->FCopy(cki.ctg, cki.cno, pcfl, &cno)) << "copy failed";
    }
    AssertPo(pcfl, fcflFull);

    pcfl->FSave('JUNK', pvNil);

    // FIXME: this check in the original test.cpp fails:
    // EXPECT_EQ(pcfl->Ccki(), 14);
    ReleasePpo(&pcflDst);

    EXPECT_TRUE(pcfl->FSave(BigLittle('JUNK', 'KNUJ'), pvNil));
    ReleasePpo(&pcfl);

    CFL::CloseUnmarked();
    CFL::ClearMarks();
    CFL::CloseUnmarked();
}

TEST(KauaiTests, TestErs)
{
    const long cercTest = 30;
    long erc, ercT;

    vpers->Clear();
    ASSERT_EQ(vpers->Cerc(), 0) << "bad count of error codes on stack";

    for (erc = 0; erc < cercTest; erc++)
    {
        EXPECT_EQ(vpers->Cerc(), LwMin(erc, kcerdMax)) << "bad count of error codes on stack";
        PushErc(erc);
        EXPECT_TRUE(vpers->FIn(erc)) << "error code not found";
    }

    for (erc = cercTest - 1; vpers->FIn(erc); erc--)
        ;
    EXPECT_EQ(erc, cercTest - kcerdMax - 1) << "lost error code " << erc;

    for (erc = 0; erc < vpers->Cerc(); erc++)
    {
        EXPECT_EQ((ercT = vpers->ErcGet(erc)), cercTest - kcerdMax + erc) << "invalid error code " << ercT;
    }

    for (erc = cercTest - 1; vpers->FPop(&ercT); erc--)
        EXPECT_EQ(ercT, erc) << "bogus error code returned";
    EXPECT_EQ(erc, cercTest - kcerdMax - 1) << "lost error code";

    for (erc = 0; erc < cercTest; erc++)
    {
        EXPECT_EQ(vpers->Cerc(), LwMin(erc, kcerdMax)) << "bad count of error codes on stack";
        PushErc(erc);
        EXPECT_TRUE(vpers->FIn(erc)) << "error code not found";
    }
    vpers->Clear();
    EXPECT_EQ(vpers->Cerc(), 0) << "bad count of error codes on stack";
}

TEST(KauaiTests, TestCrf)
{
    const CNO cnoLim = 10;
    FNI fni;
    CTG ctg = 'JUNK';
    CNO cno;
    PGHQ rgpghq[cnoLim];
    PCFL pcfl;
    PCRF pcrf;
    HQ hq;
    PGHQ pghq;

    ASSERT_TRUE(fni.FGetTemp());

    pcfl = CFL::PcflCreate(&fni, fcflWriteEnable | fcflTemp);
    ASSERT_NE(pcfl, nullptr) << "creating chunky file failed";

    for (cno = 0; cno < cnoLim; cno++)
    {
        EXPECT_TRUE(pcfl->FPutPv("Test string", 11, ctg, cno));
    }

    if (pvNil == (pcrf = CRF::PcrfNew(pcfl, 50)))
    {
        ReleasePpo(&pcfl);
        FAIL() << "creating CRF failed";
        return;
    }
    ReleasePpo(&pcfl);

    for (cno = 0; cno < cnoLim; cno++)
        pcrf->TLoad(ctg, cno, GHQ::FReadGhq, rscNil, 10);

    for (cno = 0; cno < cnoLim; cno++)
        pcrf->TLoad(ctg, cno, GHQ::FReadGhq, rscNil, 20);

    for (cno = 0; cno < cnoLim; cno++)
        pcrf->TLoad(ctg, cno, GHQ::FReadGhq, rscNil, 20 + cno);

    for (cno = 0; cno < cnoLim; cno++)
    {
        pghq = (PGHQ)pcrf->PbacoFetch(ctg, cno, GHQ::FReadGhq);
        if (pvNil == pghq)
            continue;
        hq = pghq->hq;
        EXPECT_EQ(CbOfHq(hq), 11) << "wrong length";
        EXPECT_TRUE(FEqualRgb(QvFromHq(hq), "Test string", 11)) << "bad bytes";
        ReleasePpo(&pghq);
    }

    for (cno = 0; cno < cnoLim; cno++)
    {
        pghq = (PGHQ)pcrf->PbacoFetch(ctg, cno, GHQ::FReadGhq);
        rgpghq[cno] = pghq;
        if (pvNil == pghq)
            continue;
        hq = pghq->hq;
        EXPECT_EQ(CbOfHq(hq), 11) << "wrong length";
        EXPECT_TRUE(FEqualRgb(QvFromHq(hq), "Test string", 11)) << "bad bytes";
    }

    for (cno = 0; cno < cnoLim; cno++)
    {
        ReleasePpo(&rgpghq[cno]);
    }

    ReleasePpo(&pcrf);
}