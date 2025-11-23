/**
 * String handling tests
 **/
#include <gtest/gtest.h>
#include <cstring>

#include "util.h"
ASSERTNAME

#include "utilhex.h"

const char kchEmDash = 0x97;       // CP-1252
const wchar_t kwchEmDash = 0x2014; // Unicode

TEST(KauaiStringTests, StnFormat)
{
    STN stn, stnT;

    // Characters
    stn.SetNil();
    stn.FFormatSz(PszLit("%c%c"), ChLit('3'), ChLit('D'));
    AssertPo(&stn, 0);
    EXPECT_STREQ(PszLit("3D"), stn.Psz());

    // STN strings
    stnT = PszLit("3D Movie Maker");
    stn.SetNil();
    stn.FFormatSz(PszLit("%s"), &stnT);
    EXPECT_STREQ(stnT.Psz(), stn.Psz());

    // Null-terminated strings
    PCSZ pcszNull = PszLit("3D Movie Maker");
    stn.SetNil();
    stn.FFormatSz(PszLit("%z"), pcszNull);
    AssertPo(&stn, 0);
    EXPECT_STREQ(stn.Psz(), pcszNull);

    // Chunk tags
    CTG ctg = kctgText;
    stn.SetNil();
    stn.FFormatSz(PszLit("%f"), ctg);
    AssertPo(&stn, 0);
    EXPECT_STREQ(stn.Psz(), PszLit("TEXT"));

    // Hex
    stn.SetNil();
    stn.FFormatSz(PszLit("%x"), 0x3d);
    AssertPo(&stn, 0);
    EXPECT_STREQ(PszLit("3D"), stn.Psz());

    stn.SetNil();
    stn.FFormatSz(PszLit("0x%x"), -1);
    AssertPo(&stn, 0);
    EXPECT_STREQ(PszLit("0xFFFFFFFF"), stn.Psz());

    // Signed decimal
    stn.SetNil();
    stn.FFormatSz(PszLit("%d, %d"), 0x3d, -0x3d);
    AssertPo(&stn, 0);
    EXPECT_STREQ(PszLit("61, -61"), stn.Psz());

    // Unsigned decimal
    stn.SetNil();
    stn.FFormatSz(PszLit("%u, %u"), 0x3d, -0x3d);
    AssertPo(&stn, 0);
    EXPECT_STREQ(PszLit("61, 4294967235"), stn.Psz());

    // Width
    stn.SetNil();
    stn.FFormatSz(PszLit("%3d, %-3d, %03d"), 0x3d, 0x3d, 0x3d);
    AssertPo(&stn, 0);
    EXPECT_STREQ(PszLit(" 61, 61 , 061"), stn.Psz());

    // Using an STN as a format string
    STN stnFormat = PszLit("%u%c %s %z");
    stnT = PszLit("Movie");
    stn.SetNil();
    stn.FFormat(&stnFormat, 3, ChLit('D'), &stnT, PszLit("Maker"));
    AssertPo(&stnT, 0);
    AssertPo(&stn, 0);
    EXPECT_STREQ(PszLit("3D Movie Maker"), stn.Psz());
}

TEST(KauaiStringTests, StnConvertUtf8)
{
    STN stn;

    Assert(koskCur == koskSbWin || koskCur == koskUniWin, "Unsupported koskCur");

    // Set the STN to a string containing an em-dash
    SZS szTest = "Em dash";
    szTest[2] = kchEmDash;
    stn.SetSzs(szTest);

    // Convert to UTF-8
    U8SZ u8sz;
    stn.GetUtf8Sz(u8sz);

    char rgchExpected[] = "Em"
                          "\xe2\x80\x94"
                          "dash";
    EXPECT_TRUE(FEqualRgb(rgchExpected, u8sz, SIZEOF(rgchExpected))) << "Converted UTF-8 string does not match";

    // Set the string from UTF-8 bytes
    stn.SetNil();
    stn.SetUtf8Sz(rgchExpected);

    // Check we still have the em-dash
    if (koskCur == koskSbWin)
    {
        ASSERT_EQ(stn.Cch(), 7);
        EXPECT_EQ(stn.Psz()[2], kchEmDash) << "Converted string lost em-dash character";
    }
    else if (koskCur == koskUniWin)
    {
        ASSERT_EQ(stn.Cch(), 7);
        EXPECT_EQ(stn.Psz()[2], kwchEmDash) << "Converted string lost em-dash character";
    }
    else
    {
        RawRtn();
    }
}

// Test converting a UTF-8 string that has a byte count larger than the maximum character count of an STN
TEST(KauaiStringTests, StnConvertUtf8Long)
{
    // Create a UTF-8 string containing 100 em-dashes (300 bytes)
    char rgchEmDashes[512];
    int32_t ich = 0;
    while (ich < 300)
    {
        rgchEmDashes[ich++] = 0xE2;
        rgchEmDashes[ich++] = 0x80;
        rgchEmDashes[ich++] = 0x94;
    }
    rgchEmDashes[ich++] = 0;
    ASSERT_EQ(strlen(rgchEmDashes), 300);

    STN stn;
    stn.SetUtf8Sz(rgchEmDashes);

    if (koskCur == koskSbWin)
    {
        ASSERT_EQ(stn.Cch(), 100) << "Converted string should have 100 characters";
        ASSERT_EQ(stn.Psz()[0], kchEmDash);
    }
    else if (koskCur == koskUniWin)
    {
        ASSERT_EQ(stn.Cch(), 100) << "Converted string should have 100 characters";
        ASSERT_EQ(stn.Psz()[0], kwchEmDash);
    }
    else
    {
        RawRtn();
    }
}

TEST(KauaiStringTests, HexEncoding)
{
    PCSZ pszEncoded = "49276c6c2074726164652061206d6167696320747269636b20666f72206120766173652100";
    PCSZ pszExpected = "I'll trade a magic trick for a vase!";
    SZ szEncoded;
    size_t cbData = 0;
    uint8_t rgbData[256];

    ClearPb(rgbData, SIZEOF(rgbData));

    // Test calculating just the size
    ASSERT_TRUE(FRgbFromHexString(pszEncoded, pvNil, 0, &cbData));
    ASSERT_EQ(cbData, CchSz(pszExpected) + 1);

    // Test decoding an invalid string
    ASSERT_FALSE(FRgbFromHexString(pszExpected, rgbData, SIZEOF(rgbData), &cbData));

    // Test decoding a string
    ASSERT_TRUE(FRgbFromHexString(pszEncoded, rgbData, SIZEOF(rgbData), &cbData));
    ASSERT_STREQ(pszExpected, (PCSZ)rgbData);

    // Test encoding a string
    ClearPb(szEncoded, SIZEOF(szEncoded));
    ASSERT_TRUE(FHexStringFromRgb(rgbData, cbData, szEncoded, kcchMaxSz));
    ASSERT_STREQ(szEncoded, pszEncoded);
}