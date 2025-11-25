#include <gtest/gtest.h>
#include "resources.h"

ASSERTNAME

void GetTestResourcePath(PFNI pfniTestResourcePath)
{
    AssertPo(pfniTestResourcePath, 0);

    // Check for environment variable override first
    STN stnTestResourcePath;
    SZ szEnv;
    FillPb(szEnv, SIZEOF(szEnv), 0);
    if (GetEnvironmentVariable(PszLit("KAUAI_TEST_RESOURCES"), szEnv, CvFromRgv(szEnv)) != 0)
    {
        stnTestResourcePath = szEnv;
    }
    else
    {
        // Use path defined at compile time
        SZS szTestPath = KAUAI_TEST_RESOURCES_PATH;
        stnTestResourcePath.SetSzs(szTestPath);
    }

    ASSERT_TRUE(pfniTestResourcePath->FBuildFromPath(&stnTestResourcePath, kftgDir))
        << "Could not build path to test resources: " << stnTestResourcePath.Psz();
    ASSERT_TRUE(pfniTestResourcePath->TExists() == tYes)
        << "Test resource path does not exist: " << stnTestResourcePath.Psz();
}

bool FFindTestResource(PFNI pfni, PCSZ pszName)
{
    AssertPo(pfni, 0);
    AssertSz(pszName);

    FNI fniTestResourcePath;
    GetTestResourcePath(&fniTestResourcePath);

    STN stnFileName = pszName;
    STN stnTestResourcePath;
    fniTestResourcePath.GetStnPath(&stnTestResourcePath);
    return pfni->FSearchInPath(&stnFileName, stnTestResourcePath.Psz());
}

void GetTestResource(PFNI pfni, PCSZ pszName)
{
    bool result = FFindTestResource(pfni, pszName);
    ASSERT_TRUE(result) << "Could not find test resource: " << pszName;
}
