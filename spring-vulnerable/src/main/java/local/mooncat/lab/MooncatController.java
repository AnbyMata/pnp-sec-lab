package local.mooncat.lab;

import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;

@Controller
public class MooncatController {
    private final JdbcTemplate jdbc;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
    @Value("${UPLOAD_DIR:/app/uploads}") private String uploadDir;
    public MooncatController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private Map<String,Object> one(String sql) {
        List<Map<String,Object>> rows = jdbc.queryForList(sql);
        return rows.isEmpty() ? null : rows.getFirst();
    }
    private void sessionModel(Model model, HttpSession session) {
        model.addAttribute("userId", session.getAttribute("userId"));
        model.addAttribute("nickname", session.getAttribute("nickname"));
    }

    @GetMapping("/health") public org.springframework.http.ResponseEntity<Map<String,String>> health() { return org.springframework.http.ResponseEntity.ok(Map.of("status","ok")); }
    @GetMapping("/") public String home(Model model, HttpSession session) { sessionModel(model,session); model.addAttribute("latest",jdbc.queryForList("SELECT * FROM board_modern ORDER BY id DESC LIMIT 3")); return "index"; }
    @GetMapping("/login") public String loginForm(Model model,HttpSession session) { sessionModel(model,session); return "login"; }
    @PostMapping("/login") public String login(@RequestParam(defaultValue="") String userId,@RequestParam(defaultValue="") String password,Model model,HttpSession session) {
        Map<String,Object> user=one("SELECT * FROM member_modern WHERE user_id='"+userId+"' AND password='"+password+"'");
        if(user==null){sessionModel(model,session);model.addAttribute("error","아이디 또는 비밀번호를 확인해 주세요.");return "login";}
        session.setAttribute("userId",user.get("user_id"));session.setAttribute("nickname",user.get("nickname"));return "redirect:/";
    }
    @GetMapping("/logout") public String logout(HttpSession session){session.invalidate();return "redirect:/";}
    @GetMapping("/register") public String registerForm(Model model,HttpSession session){sessionModel(model,session);return "register";}
    @PostMapping("/register") public String register(@RequestParam String userId,@RequestParam String name,@RequestParam String password,@RequestParam(defaultValue="") String nickname,@RequestParam(defaultValue="0") String age,@RequestParam(defaultValue="") String email,Model model,HttpSession session){
        if(one("SELECT * FROM member_modern WHERE user_id='"+userId+"'")!=null){sessionModel(model,session);model.addAttribute("error","이미 사용 중인 아이디예요.");return "register";}
        if(nickname.isBlank())nickname=name;jdbc.update("INSERT INTO member_modern(user_id,password,name,nickname,age,email,created_at) VALUES ('"+userId+"','"+password+"','"+name+"','"+nickname+"',"+age+",'"+email+"',NOW())");return "redirect:/login";
    }
    @GetMapping("/profile") public String profile(Model model,HttpSession session,@RequestParam(defaultValue="") String updated){if(session.getAttribute("userId")==null)return "redirect:/login";sessionModel(model,session);model.addAttribute("user",one("SELECT * FROM member_modern WHERE user_id='"+session.getAttribute("userId")+"'"));model.addAttribute("updated",updated);return "profile";}
    @PostMapping("/profile") public String updateProfile(HttpSession session,@RequestParam String nickname,@RequestParam(defaultValue="0") String age,@RequestParam(defaultValue="") String email,@RequestParam(defaultValue="") String password){String sql="UPDATE member_modern SET nickname='"+nickname+"',age="+age+",email='"+email+"'";if(!password.isBlank())sql+=",password='"+password+"'";sql+=" WHERE user_id='"+session.getAttribute("userId")+"'";jdbc.update(sql);session.setAttribute("nickname",nickname);return "redirect:/profile?updated=1";}
    @GetMapping("/profile/nickname") public String nickname(HttpSession session,@RequestParam(defaultValue="") String nickname){jdbc.update("UPDATE member_modern SET nickname='"+nickname+"' WHERE user_id='"+session.getAttribute("userId")+"'");session.setAttribute("nickname",nickname);return "redirect:/profile?updated=1";}
    @GetMapping("/board") public String board(Model model,HttpSession session,@RequestParam(defaultValue="subject") String field,@RequestParam(defaultValue="") String keyword){sessionModel(model,session);String column=Map.of("subject","subject","content","content","author","author").getOrDefault(field,"subject");List<Map<String,Object>> posts=keyword.isBlank()?jdbc.queryForList("SELECT * FROM board_modern ORDER BY id DESC"):jdbc.queryForList("SELECT * FROM board_modern WHERE "+column+" LIKE '%"+keyword+"%' ORDER BY id DESC");model.addAttribute("posts",posts);model.addAttribute("field",field);model.addAttribute("keyword",keyword);return "board";}
    @GetMapping("/board/write") public String writeForm(Model model,HttpSession session){sessionModel(model,session);return "write";}
    @PostMapping("/board/write") public String write(@RequestParam String author,@RequestParam String password,@RequestParam(defaultValue="") String email,@RequestParam String subject,@RequestParam String content,@RequestParam(defaultValue="F") String allowHtml,@RequestParam(required=false) MultipartFile attachment) throws IOException {
        String filename="";long size=0;if(attachment!=null&&!attachment.isEmpty()){filename=Path.of(attachment.getOriginalFilename()).getFileName().toString();Path target=Path.of(uploadDir,filename);Files.createDirectories(target.getParent());Files.copy(attachment.getInputStream(),target,StandardCopyOption.REPLACE_EXISTING);size=Files.size(target);}jdbc.update("INSERT INTO board_modern(author,password,email,subject,content,allow_html,filename,file_size,created_at) VALUES ('"+author+"','"+password+"','"+email+"','"+subject+"','"+content+"','"+allowHtml+"','"+filename+"',"+size+",NOW())");Integer id=jdbc.queryForObject("SELECT MAX(id) FROM board_modern",Integer.class);return "redirect:/board/"+id;
    }
    @GetMapping("/board/{postId}") public String view(@PathVariable String postId,Model model,HttpSession session){sessionModel(model,session);try{jdbc.update("UPDATE board_modern SET view_count=view_count+1 WHERE id="+postId);}catch(DataAccessException ignored){}model.addAttribute("post",one("SELECT * FROM board_modern WHERE id="+postId));model.addAttribute("postId",postId);return "view";}
    @PostMapping("/board/{postId}/delete") public String delete(@PathVariable String postId,@RequestParam(defaultValue="") String password) throws IOException {Map<String,Object> post=one("SELECT id,filename FROM board_modern WHERE id="+postId+" AND password='"+password+"'");if(post!=null){jdbc.update("DELETE FROM board_modern WHERE id="+postId);Object filename=post.get("filename");if(filename!=null&&!filename.toString().isBlank())Files.deleteIfExists(Path.of(uploadDir,filename.toString()));}return "redirect:/board";}
    @GetMapping("/oracle") public String oracle(Model model,HttpSession session,@RequestParam(defaultValue="") String url){sessionModel(model,session);model.addAttribute("url",url);if(!url.isBlank()){try{HttpRequest req=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(4)).GET().build();String result=http.send(req,HttpResponse.BodyHandlers.ofString()).body();model.addAttribute("result",result.substring(0,Math.min(5000,result.length())));}catch(Exception e){model.addAttribute("error",e.toString());}}return "oracle";}
}
