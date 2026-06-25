# ym:s:isRobotPro исключено — требует тариф Метрика Про
"""Yandex Metrika Logs API field definitions and PostgreSQL type mapping."""

from __future__ import annotations

import re
from typing import Literal

FieldType = Literal[
    "TEXT",
    "INTEGER",
    "BIGINT",
    "NUMERIC(20,0)",
    "DOUBLE PRECISION",
    "DATE",
    "TIMESTAMPTZ",
    "TEXT[]",
    "NUMERIC(20,0)[]",
]

RESERVED_COLUMNS = frozenset({"from", "to", "user", "table", "select", "where"})


def quote_column(col: str) -> str:
    if col in RESERVED_COLUMNS:
        return f'"{col}"'
    return col

VISITS_API_FIELDS = """
ym:s:visitID,ym:s:counterID,ym:s:watchIDs,ym:s:date,ym:s:dateTime,ym:s:dateTimeUTC,ym:s:isNewUser,ym:s:startURL,ym:s:endURL,ym:s:pageViews,ym:s:visitDuration,ym:s:bounce,ym:s:ipAddress,ym:s:regionCountry,ym:s:regionCity,ym:s:regionCountryID,ym:s:regionCityID,ym:s:clientID,ym:s:counterUserIDHash,ym:s:goalsID,ym:s:goalsSerialNumber,ym:s:goalsDateTime,ym:s:goalsPrice,ym:s:goalsOrder,ym:s:goalsCurrency,ym:s:automaticTrafficSource,ym:s:automaticAdvEngine,ym:s:automaticReferalSource,ym:s:automaticSearchEngineRoot,ym:s:automaticSearchEngine,ym:s:automaticSocialNetwork,ym:s:automaticSocialNetworkProfile,ym:s:referer,ym:s:automaticDirectClickOrder,ym:s:automaticDirectBannerGroup,ym:s:automaticDirectClickBanner,ym:s:automaticDirectClickOrderName,ym:s:automaticClickBannerGroupName,ym:s:automaticDirectClickBannerName,ym:s:automaticDirectPhraseOrCond,ym:s:automaticDirectPlatformType,ym:s:automaticDirectPlatform,ym:s:automaticDirectConditionType,ym:s:automaticCurrencyID,ym:s:from,ym:s:automaticUTMCampaign,ym:s:automaticUTMContent,ym:s:automaticUTMMedium,ym:s:automaticUTMSource,ym:s:automaticUTMTerm,ym:s:automaticOpenstatAd,ym:s:automaticOpenstatCampaign,ym:s:automaticOpenstatService,ym:s:automaticOpenstatSource,ym:s:automaticHasGCLID,ym:s:automaticGCLID,ym:s:browserLanguage,ym:s:browserCountry,ym:s:clientTimeZone,ym:s:deviceCategory,ym:s:mobilePhone,ym:s:mobilePhoneModel,ym:s:operatingSystemRoot,ym:s:operatingSystem,ym:s:browser,ym:s:browserMajorVersion,ym:s:browserMinorVersion,ym:s:browserEngine,ym:s:browserEngineVersion1,ym:s:browserEngineVersion2,ym:s:browserEngineVersion3,ym:s:browserEngineVersion4,ym:s:cookieEnabled,ym:s:javascriptEnabled,ym:s:screenFormat,ym:s:screenColors,ym:s:screenOrientation,ym:s:screenOrientationName,ym:s:screenWidth,ym:s:screenHeight,ym:s:physicalScreenWidth,ym:s:physicalScreenHeight,ym:s:windowClientWidth,ym:s:windowClientHeight,ym:s:purchaseID,ym:s:purchaseDateTime,ym:s:purchaseAffiliation,ym:s:purchaseRevenue,ym:s:purchaseTax,ym:s:purchaseShipping,ym:s:purchaseCoupon,ym:s:purchaseCurrency,ym:s:purchaseProductQuantity,ym:s:productID,ym:s:productList,ym:s:productBrand,ym:s:productCategory,ym:s:productCategoryLevel1,ym:s:productCategoryLevel2,ym:s:productCategoryLevel3,ym:s:productCategoryLevel4,ym:s:productCategoryLevel5,ym:s:productVariant,ym:s:productPosition,ym:s:productPrice,ym:s:productCurrency,ym:s:productCoupon,ym:s:productQuantity,ym:s:productEventTime,ym:s:productEventType,ym:s:productDiscount,ym:s:productURL,ym:s:productName,ym:s:purchasedProductPurchaseID,ym:s:purchasedProductID,ym:s:purchasedProductName,ym:s:purchasedProductBrand,ym:s:purchasedProductCategory,ym:s:purchasedProductCategoryLevel1,ym:s:purchasedProductCategoryLevel2,ym:s:purchasedProductCategoryLevel3,ym:s:purchasedProductCategoryLevel4,ym:s:purchasedProductCategoryLevel5,ym:s:purchasedProductVariant,ym:s:purchasedProductPosition,ym:s:purchasedProductPrice,ym:s:purchasedProductCurrency,ym:s:purchasedProductCoupon,ym:s:purchasedProductQuantity,ym:s:purchasedProductList,ym:s:purchasedProductEventTime,ym:s:purchasedProductDiscount,ym:s:impressionsURL,ym:s:impressionsDateTime,ym:s:impressionsProductID,ym:s:impressionsProductName,ym:s:impressionsProductBrand,ym:s:impressionsProductCategory,ym:s:impressionsProductCategory1,ym:s:impressionsProductCategory2,ym:s:impressionsProductCategory3,ym:s:impressionsProductCategory4,ym:s:impressionsProductCategory5,ym:s:impressionsProductVariant,ym:s:impressionsProductPrice,ym:s:impressionsProductCurrency,ym:s:impressionsProductCoupon,ym:s:impressionsProductList,ym:s:impressionsProductQuantity,ym:s:impressionsProductEventTime,ym:s:impressionsProductDiscount,ym:s:promotionID,ym:s:promotionName,ym:s:promotionCreative,ym:s:promotionPosition,ym:s:promotionCreativeSlot,ym:s:promotionEventTime,ym:s:promotionType,ym:s:offlineCallTalkDuration,ym:s:offlineCallHoldDuration,ym:s:offlineCallMissed,ym:s:offlineCallTag,ym:s:offlineCallFirstTimeCaller,ym:s:offlineCallURL,ym:s:parsedParamsKey1,ym:s:parsedParamsKey2,ym:s:parsedParamsKey3,ym:s:parsedParamsKey4,ym:s:parsedParamsKey5,ym:s:parsedParamsKey6,ym:s:parsedParamsKey7,ym:s:parsedParamsKey8,ym:s:parsedParamsKey9,ym:s:parsedParamsKey10,ym:s:automaticRecommendationSystem,ym:s:automaticMessenger,ym:s:automaticHasSBCLID,ym:s:automaticSBCLID
""".strip()

HITS_API_FIELDS = """
ym:pv:watchID,ym:pv:pageViewID,ym:pv:visitID,ym:pv:counterID,ym:pv:clientID,ym:pv:counterUserIDHash,ym:pv:date,ym:pv:dateTime,ym:pv:title,ym:pv:pageCharset,ym:pv:goalsID,ym:pv:URL,ym:pv:referer,ym:pv:UTMCampaign,ym:pv:UTMContent,ym:pv:UTMMedium,ym:pv:UTMSource,ym:pv:UTMTerm,ym:pv:openstatAd,ym:pv:openstatCampaign,ym:pv:openstatService,ym:pv:openstatSource,ym:pv:operatingSystem,ym:pv:from,ym:pv:hasGCLID,ym:pv:GCLID,ym:pv:lastTrafficSource,ym:pv:lastSearchEngineRoot,ym:pv:lastSearchEngine,ym:pv:lastAdvEngine,ym:pv:lastSocialNetwork,ym:pv:lastSocialNetworkProfile,ym:pv:recommendationSystem,ym:pv:messenger,ym:pv:browser,ym:pv:browserMajorVersion,ym:pv:browserMinorVersion,ym:pv:browserCountry,ym:pv:browserEngine,ym:pv:browserEngineVersion1,ym:pv:browserEngineVersion2,ym:pv:browserEngineVersion3,ym:pv:browserEngineVersion4,ym:pv:browserLanguage,ym:pv:clientTimeZone,ym:pv:cookieEnabled,ym:pv:deviceCategory,ym:pv:javascriptEnabled,ym:pv:mobilePhone,ym:pv:mobilePhoneModel,ym:pv:operatingSystemRoot,ym:pv:physicalScreenHeight,ym:pv:physicalScreenWidth,ym:pv:screenColors,ym:pv:screenFormat,ym:pv:screenHeight,ym:pv:screenOrientation,ym:pv:screenOrientationName,ym:pv:screenWidth,ym:pv:windowClientHeight,ym:pv:windowClientWidth,ym:pv:ipAddress,ym:pv:regionCity,ym:pv:regionCountry,ym:pv:regionCityID,ym:pv:regionCountryID,ym:pv:isPageView,ym:pv:isTurboPage,ym:pv:isTurboApp,ym:pv:iFrame,ym:pv:link,ym:pv:download,ym:pv:notBounce,ym:pv:artificial,ym:pv:purchaseID,ym:pv:purchaseRevenue,ym:pv:purchaseTax,ym:pv:purchaseShipping,ym:pv:purchaseCoupon,ym:pv:purchaseCurrency,ym:pv:purchaseProductQuantity,ym:pv:productID,ym:pv:productList,ym:pv:productBrand,ym:pv:productCategory,ym:pv:productCategoryLevel1,ym:pv:productCategoryLevel2,ym:pv:productCategoryLevel3,ym:pv:productCategoryLevel4,ym:pv:productCategoryLevel5,ym:pv:productVariant,ym:pv:productPosition,ym:pv:productPrice,ym:pv:productCurrency,ym:pv:productCoupon,ym:pv:productQuantity,ym:pv:productEventType,ym:pv:productDiscount,ym:pv:productName,ym:pv:promotionID,ym:pv:promotionName,ym:pv:promotionCreative,ym:pv:promotionPosition,ym:pv:promotionCreativeSlot,ym:pv:promotionEventType,ym:pv:ecommerce,ym:pv:offlineCallTalkDuration,ym:pv:offlineCallHoldDuration,ym:pv:offlineCallMissed,ym:pv:offlineCallTag,ym:pv:offlineCallFirstTimeCaller,ym:pv:offlineCallURL,ym:pv:offlineUploadingID,ym:pv:params,ym:pv:parsedParamsKey1,ym:pv:parsedParamsKey2,ym:pv:parsedParamsKey3,ym:pv:parsedParamsKey4,ym:pv:parsedParamsKey5,ym:pv:parsedParamsKey6,ym:pv:parsedParamsKey7,ym:pv:parsedParamsKey8,ym:pv:parsedParamsKey9,ym:pv:parsedParamsKey10,ym:pv:httpError,ym:pv:shareService,ym:pv:shareURL,ym:pv:shareTitle,ym:pv:hasSBCLID,ym:pv:SBCLID
""".strip()

VISITS_FIELD_TYPES: dict[str, FieldType] = {
    "ym:s:visitID": "BIGINT",
    "ym:s:counterID": "INTEGER",
    "ym:s:watchIDs": "NUMERIC(20,0)[]",
    "ym:s:date": "DATE",
    "ym:s:dateTime": "TIMESTAMPTZ",
    "ym:s:dateTimeUTC": "TIMESTAMPTZ",
    "ym:s:isNewUser": "INTEGER",
    "ym:s:startURL": "TEXT",
    "ym:s:endURL": "TEXT",
    "ym:s:pageViews": "INTEGER",
    "ym:s:visitDuration": "INTEGER",
    "ym:s:bounce": "INTEGER",
    "ym:s:ipAddress": "TEXT",
    "ym:s:regionCountry": "TEXT",
    "ym:s:regionCity": "TEXT",
    "ym:s:regionCountryID": "INTEGER",
    "ym:s:regionCityID": "INTEGER",
    "ym:s:clientID": "BIGINT",
    "ym:s:counterUserIDHash": "NUMERIC(20,0)",
    "ym:s:goalsID": "TEXT[]",
    "ym:s:goalsSerialNumber": "TEXT[]",
    "ym:s:goalsDateTime": "TEXT[]",
    "ym:s:goalsPrice": "TEXT[]",
    "ym:s:goalsOrder": "TEXT[]",
    "ym:s:goalsCurrency": "TEXT[]",
    "ym:s:automaticTrafficSource": "TEXT",
    "ym:s:automaticAdvEngine": "TEXT",
    "ym:s:automaticReferalSource": "TEXT",
    "ym:s:automaticSearchEngineRoot": "TEXT",
    "ym:s:automaticSearchEngine": "TEXT",
    "ym:s:automaticSocialNetwork": "TEXT",
    "ym:s:automaticSocialNetworkProfile": "TEXT",
    "ym:s:referer": "TEXT",
    "ym:s:automaticDirectClickOrder": "INTEGER",
    "ym:s:automaticDirectBannerGroup": "BIGINT",
    "ym:s:automaticDirectClickBanner": "TEXT",
    "ym:s:automaticDirectClickOrderName": "TEXT",
    "ym:s:automaticClickBannerGroupName": "TEXT",
    "ym:s:automaticDirectClickBannerName": "TEXT",
    "ym:s:automaticDirectPhraseOrCond": "TEXT",
    "ym:s:automaticDirectPlatformType": "TEXT",
    "ym:s:automaticDirectPlatform": "TEXT",
    "ym:s:automaticDirectConditionType": "TEXT",
    "ym:s:automaticCurrencyID": "TEXT",
    "ym:s:from": "TEXT",
    "ym:s:automaticUTMCampaign": "TEXT",
    "ym:s:automaticUTMContent": "TEXT",
    "ym:s:automaticUTMMedium": "TEXT",
    "ym:s:automaticUTMSource": "TEXT",
    "ym:s:automaticUTMTerm": "TEXT",
    "ym:s:automaticOpenstatAd": "TEXT",
    "ym:s:automaticOpenstatCampaign": "TEXT",
    "ym:s:automaticOpenstatService": "TEXT",
    "ym:s:automaticOpenstatSource": "TEXT",
    "ym:s:automaticHasGCLID": "INTEGER",
    "ym:s:automaticGCLID": "TEXT",
    "ym:s:browserLanguage": "TEXT",
    "ym:s:browserCountry": "TEXT",
    "ym:s:clientTimeZone": "INTEGER",
    "ym:s:deviceCategory": "TEXT",
    "ym:s:mobilePhone": "TEXT",
    "ym:s:mobilePhoneModel": "TEXT",
    "ym:s:operatingSystemRoot": "TEXT",
    "ym:s:operatingSystem": "TEXT",
    "ym:s:browser": "TEXT",
    "ym:s:browserMajorVersion": "INTEGER",
    "ym:s:browserMinorVersion": "INTEGER",
    "ym:s:browserEngine": "TEXT",
    "ym:s:browserEngineVersion1": "INTEGER",
    "ym:s:browserEngineVersion2": "INTEGER",
    "ym:s:browserEngineVersion3": "INTEGER",
    "ym:s:browserEngineVersion4": "INTEGER",
    "ym:s:cookieEnabled": "INTEGER",
    "ym:s:javascriptEnabled": "INTEGER",
    "ym:s:screenFormat": "TEXT",
    "ym:s:screenColors": "INTEGER",
    "ym:s:screenOrientation": "INTEGER",
    "ym:s:screenOrientationName": "TEXT",
    "ym:s:screenWidth": "INTEGER",
    "ym:s:screenHeight": "INTEGER",
    "ym:s:physicalScreenWidth": "INTEGER",
    "ym:s:physicalScreenHeight": "INTEGER",
    "ym:s:windowClientWidth": "INTEGER",
    "ym:s:windowClientHeight": "INTEGER",
    "ym:s:purchaseID": "TEXT[]",
    "ym:s:purchaseDateTime": "TEXT[]",
    "ym:s:purchaseAffiliation": "TEXT[]",
    "ym:s:purchaseRevenue": "TEXT[]",
    "ym:s:purchaseTax": "TEXT[]",
    "ym:s:purchaseShipping": "TEXT[]",
    "ym:s:purchaseCoupon": "TEXT[]",
    "ym:s:purchaseCurrency": "TEXT[]",
    "ym:s:purchaseProductQuantity": "TEXT[]",
    "ym:s:productID": "TEXT[]",
    "ym:s:productList": "TEXT[]",
    "ym:s:productBrand": "TEXT[]",
    "ym:s:productCategory": "TEXT[]",
    "ym:s:productCategoryLevel1": "TEXT[]",
    "ym:s:productCategoryLevel2": "TEXT[]",
    "ym:s:productCategoryLevel3": "TEXT[]",
    "ym:s:productCategoryLevel4": "TEXT[]",
    "ym:s:productCategoryLevel5": "TEXT[]",
    "ym:s:productVariant": "TEXT[]",
    "ym:s:productPosition": "TEXT[]",
    "ym:s:productPrice": "TEXT[]",
    "ym:s:productCurrency": "TEXT[]",
    "ym:s:productCoupon": "TEXT[]",
    "ym:s:productQuantity": "TEXT[]",
    "ym:s:productEventTime": "TEXT[]",
    "ym:s:productEventType": "TEXT[]",
    "ym:s:productDiscount": "TEXT[]",
    "ym:s:productURL": "TEXT[]",
    "ym:s:productName": "TEXT[]",
    "ym:s:purchasedProductPurchaseID": "TEXT[]",
    "ym:s:purchasedProductID": "TEXT[]",
    "ym:s:purchasedProductName": "TEXT[]",
    "ym:s:purchasedProductBrand": "TEXT[]",
    "ym:s:purchasedProductCategory": "TEXT[]",
    "ym:s:purchasedProductCategoryLevel1": "TEXT[]",
    "ym:s:purchasedProductCategoryLevel2": "TEXT[]",
    "ym:s:purchasedProductCategoryLevel3": "TEXT[]",
    "ym:s:purchasedProductCategoryLevel4": "TEXT[]",
    "ym:s:purchasedProductCategoryLevel5": "TEXT[]",
    "ym:s:purchasedProductVariant": "TEXT[]",
    "ym:s:purchasedProductPosition": "TEXT[]",
    "ym:s:purchasedProductPrice": "TEXT[]",
    "ym:s:purchasedProductCurrency": "TEXT[]",
    "ym:s:purchasedProductCoupon": "TEXT[]",
    "ym:s:purchasedProductQuantity": "TEXT[]",
    "ym:s:purchasedProductList": "TEXT[]",
    "ym:s:purchasedProductEventTime": "TEXT[]",
    "ym:s:purchasedProductDiscount": "TEXT[]",
    "ym:s:impressionsURL": "TEXT[]",
    "ym:s:impressionsDateTime": "TEXT[]",
    "ym:s:impressionsProductID": "TEXT[]",
    "ym:s:impressionsProductName": "TEXT[]",
    "ym:s:impressionsProductBrand": "TEXT[]",
    "ym:s:impressionsProductCategory": "TEXT[]",
    "ym:s:impressionsProductCategory1": "TEXT[]",
    "ym:s:impressionsProductCategory2": "TEXT[]",
    "ym:s:impressionsProductCategory3": "TEXT[]",
    "ym:s:impressionsProductCategory4": "TEXT[]",
    "ym:s:impressionsProductCategory5": "TEXT[]",
    "ym:s:impressionsProductVariant": "TEXT[]",
    "ym:s:impressionsProductPrice": "TEXT[]",
    "ym:s:impressionsProductCurrency": "TEXT[]",
    "ym:s:impressionsProductCoupon": "TEXT[]",
    "ym:s:impressionsProductList": "TEXT[]",
    "ym:s:impressionsProductQuantity": "TEXT[]",
    "ym:s:impressionsProductEventTime": "TEXT[]",
    "ym:s:impressionsProductDiscount": "TEXT[]",
    "ym:s:promotionID": "TEXT[]",
    "ym:s:promotionName": "TEXT[]",
    "ym:s:promotionCreative": "TEXT[]",
    "ym:s:promotionPosition": "TEXT[]",
    "ym:s:promotionCreativeSlot": "TEXT[]",
    "ym:s:promotionEventTime": "TEXT[]",
    "ym:s:promotionType": "TEXT[]",
    "ym:s:offlineCallTalkDuration": "TEXT[]",
    "ym:s:offlineCallHoldDuration": "TEXT[]",
    "ym:s:offlineCallMissed": "TEXT[]",
    "ym:s:offlineCallTag": "TEXT[]",
    "ym:s:offlineCallFirstTimeCaller": "TEXT[]",
    "ym:s:offlineCallURL": "TEXT[]",
    "ym:s:parsedParamsKey1": "TEXT[]",
    "ym:s:parsedParamsKey2": "TEXT[]",
    "ym:s:parsedParamsKey3": "TEXT[]",
    "ym:s:parsedParamsKey4": "TEXT[]",
    "ym:s:parsedParamsKey5": "TEXT[]",
    "ym:s:parsedParamsKey6": "TEXT[]",
    "ym:s:parsedParamsKey7": "TEXT[]",
    "ym:s:parsedParamsKey8": "TEXT[]",
    "ym:s:parsedParamsKey9": "TEXT[]",
    "ym:s:parsedParamsKey10": "TEXT[]",
    "ym:s:automaticRecommendationSystem": "TEXT",
    "ym:s:automaticMessenger": "TEXT",
    "ym:s:automaticHasSBCLID": "INTEGER",
    "ym:s:automaticSBCLID": "TEXT",
}

HITS_FIELD_TYPES: dict[str, FieldType] = {
    "ym:pv:watchID": "NUMERIC(20,0)",
    "ym:pv:pageViewID": "INTEGER",
    "ym:pv:visitID": "NUMERIC(20,0)",
    "ym:pv:counterID": "INTEGER",
    "ym:pv:clientID": "BIGINT",
    "ym:pv:counterUserIDHash": "NUMERIC(20,0)",
    "ym:pv:date": "DATE",
    "ym:pv:dateTime": "TIMESTAMPTZ",
    "ym:pv:title": "TEXT",
    "ym:pv:pageCharset": "TEXT",
    "ym:pv:goalsID": "TEXT[]",
    "ym:pv:URL": "TEXT",
    "ym:pv:referer": "TEXT",
    "ym:pv:UTMCampaign": "TEXT",
    "ym:pv:UTMContent": "TEXT",
    "ym:pv:UTMMedium": "TEXT",
    "ym:pv:UTMSource": "TEXT",
    "ym:pv:UTMTerm": "TEXT",
    "ym:pv:openstatAd": "TEXT",
    "ym:pv:openstatCampaign": "TEXT",
    "ym:pv:openstatService": "TEXT",
    "ym:pv:openstatSource": "TEXT",
    "ym:pv:operatingSystem": "TEXT",
    "ym:pv:from": "TEXT",
    "ym:pv:hasGCLID": "INTEGER",
    "ym:pv:GCLID": "TEXT",
    "ym:pv:lastTrafficSource": "TEXT",
    "ym:pv:lastSearchEngineRoot": "TEXT",
    "ym:pv:lastSearchEngine": "TEXT",
    "ym:pv:lastAdvEngine": "TEXT",
    "ym:pv:lastSocialNetwork": "TEXT",
    "ym:pv:lastSocialNetworkProfile": "TEXT",
    "ym:pv:recommendationSystem": "TEXT",
    "ym:pv:messenger": "TEXT",
    "ym:pv:browser": "TEXT",
    "ym:pv:browserMajorVersion": "INTEGER",
    "ym:pv:browserMinorVersion": "INTEGER",
    "ym:pv:browserCountry": "TEXT",
    "ym:pv:browserEngine": "TEXT",
    "ym:pv:browserEngineVersion1": "INTEGER",
    "ym:pv:browserEngineVersion2": "INTEGER",
    "ym:pv:browserEngineVersion3": "INTEGER",
    "ym:pv:browserEngineVersion4": "INTEGER",
    "ym:pv:browserLanguage": "TEXT",
    "ym:pv:clientTimeZone": "INTEGER",
    "ym:pv:cookieEnabled": "INTEGER",
    "ym:pv:deviceCategory": "TEXT",
    "ym:pv:javascriptEnabled": "INTEGER",
    "ym:pv:mobilePhone": "TEXT",
    "ym:pv:mobilePhoneModel": "TEXT",
    "ym:pv:operatingSystemRoot": "TEXT",
    "ym:pv:physicalScreenHeight": "INTEGER",
    "ym:pv:physicalScreenWidth": "INTEGER",
    "ym:pv:screenColors": "INTEGER",
    "ym:pv:screenFormat": "TEXT",
    "ym:pv:screenHeight": "INTEGER",
    "ym:pv:screenOrientation": "INTEGER",
    "ym:pv:screenOrientationName": "TEXT",
    "ym:pv:screenWidth": "INTEGER",
    "ym:pv:windowClientHeight": "INTEGER",
    "ym:pv:windowClientWidth": "INTEGER",
    "ym:pv:ipAddress": "TEXT",
    "ym:pv:regionCity": "TEXT",
    "ym:pv:regionCountry": "TEXT",
    "ym:pv:regionCityID": "INTEGER",
    "ym:pv:regionCountryID": "INTEGER",
    "ym:pv:isPageView": "INTEGER",
    "ym:pv:isTurboPage": "INTEGER",
    "ym:pv:isTurboApp": "INTEGER",
    "ym:pv:iFrame": "INTEGER",
    "ym:pv:link": "INTEGER",
    "ym:pv:download": "INTEGER",
    "ym:pv:notBounce": "INTEGER",
    "ym:pv:artificial": "INTEGER",
    "ym:pv:purchaseID": "TEXT[]",
    "ym:pv:purchaseRevenue": "TEXT[]",
    "ym:pv:purchaseTax": "TEXT[]",
    "ym:pv:purchaseShipping": "TEXT[]",
    "ym:pv:purchaseCoupon": "TEXT[]",
    "ym:pv:purchaseCurrency": "TEXT[]",
    "ym:pv:purchaseProductQuantity": "TEXT[]",
    "ym:pv:productID": "TEXT[]",
    "ym:pv:productList": "TEXT[]",
    "ym:pv:productBrand": "TEXT[]",
    "ym:pv:productCategory": "TEXT[]",
    "ym:pv:productCategoryLevel1": "TEXT[]",
    "ym:pv:productCategoryLevel2": "TEXT[]",
    "ym:pv:productCategoryLevel3": "TEXT[]",
    "ym:pv:productCategoryLevel4": "TEXT[]",
    "ym:pv:productCategoryLevel5": "TEXT[]",
    "ym:pv:productVariant": "TEXT[]",
    "ym:pv:productPosition": "TEXT[]",
    "ym:pv:productPrice": "TEXT[]",
    "ym:pv:productCurrency": "TEXT[]",
    "ym:pv:productCoupon": "TEXT[]",
    "ym:pv:productQuantity": "TEXT[]",
    "ym:pv:productEventType": "TEXT[]",
    "ym:pv:productDiscount": "TEXT[]",
    "ym:pv:productName": "TEXT[]",
    "ym:pv:promotionID": "TEXT[]",
    "ym:pv:promotionName": "TEXT[]",
    "ym:pv:promotionCreative": "TEXT[]",
    "ym:pv:promotionPosition": "TEXT[]",
    "ym:pv:promotionCreativeSlot": "TEXT[]",
    "ym:pv:promotionEventType": "TEXT[]",
    "ym:pv:ecommerce": "TEXT",
    "ym:pv:offlineCallTalkDuration": "INTEGER",
    "ym:pv:offlineCallHoldDuration": "INTEGER",
    "ym:pv:offlineCallMissed": "INTEGER",
    "ym:pv:offlineCallTag": "TEXT",
    "ym:pv:offlineCallFirstTimeCaller": "INTEGER",
    "ym:pv:offlineCallURL": "TEXT",
    "ym:pv:offlineUploadingID": "TEXT",
    "ym:pv:params": "TEXT",
    "ym:pv:parsedParamsKey1": "TEXT[]",
    "ym:pv:parsedParamsKey2": "TEXT[]",
    "ym:pv:parsedParamsKey3": "TEXT[]",
    "ym:pv:parsedParamsKey4": "TEXT[]",
    "ym:pv:parsedParamsKey5": "TEXT[]",
    "ym:pv:parsedParamsKey6": "TEXT[]",
    "ym:pv:parsedParamsKey7": "TEXT[]",
    "ym:pv:parsedParamsKey8": "TEXT[]",
    "ym:pv:parsedParamsKey9": "TEXT[]",
    "ym:pv:parsedParamsKey10": "TEXT[]",
    "ym:pv:httpError": "TEXT",
    "ym:pv:shareService": "TEXT",
    "ym:pv:shareURL": "TEXT",
    "ym:pv:shareTitle": "TEXT",
    "ym:pv:hasSBCLID": "INTEGER",
    "ym:pv:SBCLID": "TEXT",
}


def api_to_column(api_name: str) -> str:
    field = api_name.split(":")[-1]
    special = {"GCLID": "gclid", "SBCLID": "sbclid", "URL": "url"}
    if field in special:
        return special[field]
    field = re.sub(r"IDs$", "_ids", field)
    field = re.sub(r"ID$", "_id", field)
    name = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", field)
    name = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    return name.lower()


def parse_field_list(fields_csv: str) -> list[str]:
    return [f.strip() for f in fields_csv.split(",") if f.strip()]


VISITS_FIELDS = parse_field_list(VISITS_API_FIELDS)
HITS_FIELDS = parse_field_list(HITS_API_FIELDS)

VISITS_PK_FIELDS = ["ym:s:visitID", "ym:s:counterID"]
HITS_PK_FIELDS = ["ym:pv:watchID", "ym:pv:counterID"]


def split_fields_into_chunks(fields: list[str], max_chars: int = 2900) -> list[str]:
    chunks: list[list[str]] = []
    current: list[str] = []
    current_len = 0

    for field in fields:
        extra = len(field) + (1 if current else 0)
        if current and current_len + extra > max_chars:
            chunks.append(current)
            current = [field]
            current_len = len(field)
        else:
            current.append(field)
            current_len += extra

    if current:
        chunks.append(current)

    return [",".join(chunk) for chunk in chunks]


def _field_chunks(fields: list[str], pk_fields: list[str], max_chars: int = 2900) -> list[str]:
    pk_set = set(pk_fields)
    rest = [field for field in fields if field not in pk_set]
    pk_prefix = ",".join(pk_fields)
    pk_budget = len(pk_prefix) + (1 if rest else 0)
    rest_chunks = split_fields_into_chunks(rest, max(1, max_chars - pk_budget))
    if not rest_chunks:
        return [pk_prefix]
    return [f"{pk_prefix},{chunk}" if chunk else pk_prefix for chunk in rest_chunks]


VISITS_FIELD_CHUNKS = _field_chunks(VISITS_FIELDS, VISITS_PK_FIELDS)
HITS_FIELD_CHUNKS = _field_chunks(HITS_FIELDS, HITS_PK_FIELDS)


def get_visits_schema() -> list[tuple[str, str, FieldType]]:
    return [(api, api_to_column(api), VISITS_FIELD_TYPES[api]) for api in VISITS_FIELDS]


def get_hits_schema() -> list[tuple[str, str, FieldType]]:
    return [(api, api_to_column(api), HITS_FIELD_TYPES[api]) for api in HITS_FIELDS]


def generate_init_sql() -> str:
    lines = [
        "-- raw_metrika visits and hits tables",
        "-- Generated from fields.py — do not edit manually",
        "",
        "CREATE SCHEMA IF NOT EXISTS raw_metrika;",
        "",
    ]

    for table, schema, pk_cols in [
        ("visits", get_visits_schema(), ("visit_id", "counter_id")),
        ("hits", get_hits_schema(), ("watch_id", "counter_id")),
    ]:
        col_defs = []
        for _, col, pg_type in schema:
            col_defs.append(f"    {quote_column(col)} {pg_type}")
        col_defs.extend([
            "    loaded_at TIMESTAMPTZ DEFAULT NOW()",
            "    date_from DATE",
            "    date_to DATE",
        ])
        pk = ", ".join(quote_column(c) for c in pk_cols)
        update_cols = [col for _, col, _ in schema]
        update_cols.extend(["date_from", "date_to"])
        update_set = ",\n    ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
        lines.extend([
            f"CREATE TABLE IF NOT EXISTS raw_metrika.{table} (",
            ",\n".join(col_defs),
            f",\n    PRIMARY KEY ({pk})",
            ");",
            "",
            f"CREATE INDEX IF NOT EXISTS idx_{table}_date ON raw_metrika.{table} (date);",
            f"CREATE INDEX IF NOT EXISTS idx_{table}_counter_date ON raw_metrika.{table} (counter_id, date);",
            "",
        ])

    return "\n".join(lines)


if __name__ == "__main__":
    from pathlib import Path

    sql_path = Path(__file__).parent / "sql" / "001_init.sql"
    sql_path.write_text(generate_init_sql(), encoding="utf-8")
    print(f"Wrote {sql_path}")
