import { toJson } from "@bufbuild/protobuf";
import { UserSchema, type User } from "@/gen/hema/v1/common_pb";

/**
 * userToJson превращает protobuf-сообщение User в обычный JSON-объект,
 * пригодный для NextResponse.json (Timestamp → ISO-строка, без BigInt).
 */
export function userToJson(user: User | undefined) {
  if (!user) return null;
  return toJson(UserSchema, user);
}
