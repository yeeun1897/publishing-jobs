// 출판사 10곳. homepage는 접속(200 응답)을 확인한 주소만 넣었고, 확인 못한 것은 null입니다.
// instagram은 공식 홈페이지에 걸린 링크만 넣었고 나머지는 null입니다.
// careerUrl(공식 채용 페이지)은 아직 확인하지 못해 모두 null입니다.
window.PUBLISHERS = [
  { name: "민음사",     homepage: "https://minumsa.com",        instagram: null, careerUrl: null, refs: [] },
  { name: "문학동네",   homepage: "https://munhak.com",         instagram: null, careerUrl: null, refs: [{ label: "원티드 기업 페이지", url: "https://www.wanted.co.kr/company/26517" }] },
  { name: "열린책들",   homepage: "http://www.openbooks.co.kr", instagram: null, careerUrl: null, refs: [] },
  { name: "문학과지성사", homepage: "https://moonji.com",        instagram: "https://www.instagram.com/moonji_books/", careerUrl: null, refs: [] },
  { name: "창비",       homepage: "https://www.changbi.com",    instagram: null, careerUrl: null, refs: [] },
  { name: "을유문화사", homepage: "https://www.eulyoo.co.kr",   instagram: "https://www.instagram.com/eulyoo/", careerUrl: null, refs: [] },
  { name: "다산북스",   homepage: null,                         instagram: null, careerUrl: null, refs: [{ label: "캐치 기업 채용 페이지", url: "https://www.catch.co.kr/Comp/RecruitInfo/482710" }] },
  { name: "현암사",     homepage: null,                         instagram: null, careerUrl: null, refs: [] },
  { name: "김영사",     homepage: "https://www.gimmyoung.com",  instagram: "https://www.instagram.com/gimmyoung", careerUrl: null, refs: [] },
  { name: "동서문화사", homepage: null,                         instagram: null, careerUrl: null, refs: [] }
];
